import { describe, expect, it } from "vitest";
import { extractWithRules } from "@/server/providers/reasoning/rules/engine";
import { normaliseReasoning, spokenToDigits } from "@/server/reliability/normalise";
import { validateExtraction } from "@/server/reliability/validate";
import type { ReasoningOutput } from "@/server/reliability/reasoning-schema";
import { NOW, ORDERS, order } from "./fixtures";

// NOW = Friday 6 Nov 2026, 14:00 IST.

/** Every confidence the rules engine emits must be null — it has no real score to give. */
function expectNoInventedConfidence(r: ReasoningOutput) {
  for (const f of [r.orderReference, r.issue, r.requestedAction, r.time, r.notes]) expect(f.confidence).toBeNull();
}

function run(transcript: string) {
  const r = extractWithRules(transcript);
  expectNoInventedConfidence(r);
  return r;
}

describe("rules engine — Hinglish (romanised)", () => {
  it("reads the canonical reschedule report", () => {
    const r = run("Boss, order 4821 ka customer ghar pe nahi hai. Usne bola shaam 6 baje ke baad delivery karna.");
    expect(r.orderReference.spoken).toBe("order 4821");
    expect(r.issue.value).toBe("CUSTOMER_UNAVAILABLE");
    expect(r.requestedAction.value).toBe("RESCHEDULE");
    expect(r.time).toMatchObject({ kind: "AFTER", startHour: 18, startMinute: 0, quote: "shaam 6 baje ke baad" });
    expect(r.ambiguities.join(" ")).not.toMatch(/assumed/);
  });

  it("reads Hindi digit words as Prisma transcribed them live", () => {
    const r = run("order char auth do ek customer phone nahi utha raha");
    expect(spokenToDigits(r.orderReference.spoken)).toBe("4821");
    expect(r.requestedAction.value).toBe("MARK_CUSTOMER_UNAVAILABLE");
  });

  it("records new delivery instructions as a note", () => {
    const r = run("Order 4952 ka customer bol raha hai gate number 2 se aana, main gate band hai.");
    expect(r.requestedAction.value).toBe("UPDATE_INSTRUCTIONS");
    expect(r.notes.value).toBe("gate number 2 se aana");
  });

  it.each([
    ["kal dopahar 2 baje try karna", { kind: "AT", dayOffset: 1, startHour: 14 }],
    ["shaam 7 se 8 ke beech laana", { kind: "BETWEEN", startHour: 19, endHour: 20 }],
    ["saadhe 4 baje ke baad", { kind: "AFTER", startHour: 16, startMinute: 30 }],
    ["subah 11 baje se pehle", { kind: "BEFORE", endHour: 11 }],
    ["shaam chhe baje ke baad", { kind: "AFTER", startHour: 18 }],
    ["kal subah aana", { kind: "BETWEEN", dayOffset: 1, startHour: 9, endHour: 12 }],
    ["Monday ko deliver karna", { kind: "DATE_ONLY", weekday: "monday" }],
    ["parso dena", { kind: "DATE_ONLY", dayOffset: 2 }],
  ])("time: %s", (text, expected) => {
    expect(run(text).time).toMatchObject(expected);
  });
});

describe("rules engine — Hindi (Devanagari)", () => {
  it("reads a full Hindi report with spoken digits and an evening time", () => {
    const t = "ऑर्डर चार आठ दो एक का कस्टमर घर पर नहीं है, शाम छह बजे के बाद डिलीवरी करना।";
    const r = run(t);
    expect(r.orderReference.spoken).toBe("ऑर्डर चार आठ दो एक");
    expect(spokenToDigits(r.orderReference.spoken)).toBe("4821");
    expect(r.issue.value).toBe("CUSTOMER_UNAVAILABLE");
    expect(r.requestedAction.value).toBe("RESCHEDULE");
    expect(r.time).toMatchObject({ kind: "AFTER", startHour: 18, quote: "शाम छह बजे के बाद" });
    // 18:00 must come from understanding "शाम" (evening), not from the no-AM/PM assumption.
    expect(r.ambiguities.join(" ")).not.toMatch(/assumed/);
  });

  it("reads Devanagari digits and a wrong address", () => {
    const r = run("ऑर्डर ४९०७ का पता गलत है");
    expect(spokenToDigits(r.orderReference.spoken)).toBe("4907");
    expect(r.requestedAction.value).toBe("FLAG_ADDRESS_ISSUE");
  });

  it("classifies a damaged, refused package", () => {
    const r = run("ऑर्डर 6120 का पैकेज टूटा हुआ है, ग्राहक ने लेने से मना कर दिया।");
    expect(r.issue.value).toBe("PACKAGE_UNDELIVERABLE");
    expect(r.requestedAction.value).toBe("MARK_DELIVERY_FAILED");
  });

  it("escalates a handover to a neighbour", () => {
    const r = run("ऑर्डर 4410 का ग्राहक घर पर नहीं है, पड़ोसी को देने को बोला");
    expect(r.requestedAction.value).toBe("ESCALATE_TO_DISPATCHER");
  });

  // Verbatim Gnani Prisma hi-IN output from the live run on 2026-11-09: digits come back spaced apart and
  // times as "07:00". Before the fix these produced "no order" and 12:00 instead of 19:00.
  it("reads Prisma's spaced digits and HH:MM time (live hi-IN transcript)", () => {
    const r = run("ऑर्डर 4 9 5 2 का कस्टमर घर पर नहीं है, शाम 07:00 बजे के बाद डिलीवरी करना।");
    expect(spokenToDigits(r.orderReference.spoken)).toBe("4952");
    expect(r.time).toMatchObject({ kind: "AFTER", startHour: 19, startMinute: 0, quote: "शाम 07:00 बजे के बाद" });
    expect(r.ambiguities.join(" ")).not.toMatch(/assumed/);
  });

  it("reads Prisma's spaced digits for an unknown order (live hi-IN transcript)", () => {
    const r = run("ऑर्डर 9 1 3 4 का ग्राहक फोन नहीं उठा रहा।");
    expect(spokenToDigits(r.orderReference.spoken)).toBe("9134");
    expect(r.requestedAction.value).toBe("MARK_CUSTOMER_UNAVAILABLE");
  });

  it("never reads an hour from the middle of a time", () => {
    const r = run("डिलीवरी 07:30 बजे के बाद");
    expect(r.time).toMatchObject({ startHour: 19, startMinute: 30 });
  });

  it("does not treat a stray two-digit number as an order", () => {
    expect(run("customer ne 2 baar call kiya, ghar pe nahi hai").orderReference.spoken).toBeNull();
  });

  it("reads English digits as Prisma writes them in Devanagari on hi-IN", () => {
    expect(spokenToDigits(run("ऑर्डर फोर एट टू वन का कस्टमर फोन नहीं उठा रहा").orderReference.spoken)).toBe("4821");
  });

  it.each([
    ["कल सुबह आना", { kind: "BETWEEN", dayOffset: 1, startHour: 9 }],
    ["सोमवार को डिलीवर करना", { kind: "DATE_ONLY", weekday: "monday" }],
    ["कल दोपहर दो बजे", { kind: "AT", dayOffset: 1, startHour: 14 }],
    ["शाम सात से आठ बजे के बीच", { kind: "BETWEEN", startHour: 19, endHour: 20 }],
    ["रात नौ बजे से पहले", { kind: "BEFORE", endHour: 21 }],
  ])("time: %s", (text, expected) => {
    expect(run(text).time).toMatchObject(expected);
  });
});

describe("rules engine — English", () => {
  it("reads instructions and a 12-hour time", () => {
    expect(run("Order 4907, security not allowing entry, customer said leave it at reception.").requestedAction.value).toBe("UPDATE_INSTRUCTIONS");
    expect(run("customer not at home, deliver after 6 pm tomorrow").time).toMatchObject({ kind: "AFTER", dayOffset: 1, startHour: 18 });
    expect(run("between 6 and 8 pm please").time).toMatchObject({ kind: "BETWEEN", startHour: 18, endHour: 20 });
  });
});

describe("rules engine — ambiguous reports", () => {
  it("refuses to choose between two different order numbers", () => {
    const r = run("Order 4821 ka customer ghar pe nahi hai, aur order 4907 ka bhi.");
    expect(r.orderReference.spoken).toBeNull();
    expect(r.ambiguities.join(" ")).toMatch(/More than one order number.*4821.*4907/);
  });

  it("accepts the same order mentioned twice", () => {
    expect(spokenToDigits(run("order 4821, haan 4821 ka customer ghar pe nahi hai").orderReference.spoken)).toBe("4821");
  });

  it("asks for a time when the agent only says 'later'", () => {
    const r = run("Order 4821 ka customer bol raha baad mein aana");
    expect(r.requestedAction.value).toBe("RESCHEDULE");
    expect(r.time.kind).toBeNull();
  });

  it("flags several issues and applies the strongest", () => {
    const r = run("Order 6655 ka address galat hai aur box bhi damaged hai");
    expect(r.requestedAction.value).toBe("MARK_DELIVERY_FAILED");
    expect(r.ambiguities.join(" ")).toMatch(/Several issues/);
  });

  it("states its assumption when no AM/PM is given", () => {
    const r = run("order 4821 6 baje ke baad dena");
    expect(r.time).toMatchObject({ kind: "AFTER", startHour: 18 });
    expect(r.ambiguities.join(" ")).toMatch(/assumed 18:00/);
  });

  it("does not guess a compound number it cannot read", () => {
    const r = run("बॉस ऑर्डर फोर थाउज़ंड 800 एन्ड 21 का कस्टमर");
    expect(r.orderReference.spoken).toBeNull();
    expect(r.ambiguities.join(" ")).toMatch(/could not be read/);
  });

  it("returns nothing actionable for small talk", () => {
    const r = run("hello boss, sab theek hai");
    expect(r.requestedAction.value).toBeNull();
    expect(r.orderReference.spoken).toBeNull();
  });

  it("is deterministic", () => {
    const t = "ऑर्डर चार आठ दो एक का कस्टमर घर पर नहीं है";
    expect(extractWithRules(t)).toEqual(extractWithRules(t));
  });
});

describe("rules engine → normaliser → validator", () => {
  const verify = (transcript: string, language: "hi" | "en" | "hi-en", orders = ORDERS) => {
    const { payload } = normaliseReasoning(extractWithRules(transcript), transcript, NOW);
    return validateExtraction({ raw: payload, transcript, transcriptConfidence: null, agentId: "AG-1", referenceTime: NOW, orders, language });
  };

  it("verifies a Hindi reschedule and answers in Hindi", () => {
    const out = verify("ऑर्डर चार आठ दो एक का कस्टमर घर पर नहीं है, शाम छह बजे के बाद डिलीवरी करना।", "hi");
    expect(out.outcome).toBe("VERIFIED");
    expect(out.resolvedOrder?.id).toBe("ORD-4821");
    expect(out.prompt).toMatch(/^ऑर्डर 4821: डिलीवरी .* के बाद रीशेड्यूल करूँ\?/);
  });

  it("rejects an unknown Hindi order number with a Hindi clarification", () => {
    const out = verify("ऑर्डर नौ एक तीन चार का कस्टमर घर पर नहीं है", "hi");
    expect(out.outcome).toBe("NEEDS_CLARIFICATION");
    expect(out.checks.find((c) => c.id === "ORDER_EXISTS")?.status).toBe("FAIL");
    expect(out.prompt).toBe("ऑर्डर 9134 नहीं मिला। कृपया ऑर्डर नंबर दोबारा बोलिए।");
  });

  it("suggests the single near-miss for a misheard Hinglish order", () => {
    const out = verify("order saat saat ek chhe ka customer phone nahi utha raha", "hi-en"); // 7716 vs ORD-7761
    expect(out.outcome).toBe("NEEDS_CLARIFICATION");
    expect(out.prompt).toContain("7761");
  });

  it("asks which order when two were mentioned", () => {
    const out = verify("Order 4821 ka customer ghar pe nahi hai, aur order 4907 ka bhi.", "en", [...ORDERS, order("ORD-4907")]);
    expect(out.outcome).toBe("NEEDS_CLARIFICATION");
    expect(out.prompt).toBe("Which order is this about? Please say the order number.");
  });

  it("asks for a time when 'later' had none", () => {
    const out = verify("Order 4821 ka customer bol raha baad mein aana", "hi-en");
    expect(out.outcome).toBe("NEEDS_CLARIFICATION");
    expect(out.prompt).toMatch(/kis time/);
  });
});
