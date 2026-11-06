import { describe, expect, it } from "vitest";
import { dayOffsetFor, locate, normaliseReasoning, resolveTime, spokenToDigits } from "@/server/reliability/normalise";
import type { ReasoningOutput } from "@/server/reliability/reasoning-schema";
import { PROMPTS, confirmationPrompt } from "@/server/reliability/prompts";
import { NOW, order, payload } from "./fixtures";

// NOW = 2026-11-06T08:30Z = Friday 14:00 IST

describe("spokenToDigits", () => {
  it.each([
    ["4821", "4821"],
    ["order 4,821", "4821"], // Prisma `transcribe` output (live)
    ["ORD-4821", "4821"],
    ["#4821", "4821"],
    ["order char auth do ek", "4821"], // Prisma output for "chaar aath do ek" (live)
    ["chaar aath do ek", "4821"],
    ["चार आठ दो एक", "4821"],
    ["४८२१", "4821"],
    ["four eight two one", "4821"],
    ["forty eight twenty one", "4821"],
    ["double four two one", "4421"],
    ["9134 wala", "9134"],
    ["nau ek teen char", "9134"],
  ])("%s → %s", (spoken, digits) => {
    expect(spokenToDigits(spoken)).toBe(digits);
  });

  it.each([["order banana four"], ["the blue one"], ["do"], [""]])("refuses to guess: %s", (spoken) => {
    expect(spokenToDigits(spoken)).toBeNull();
  });
});

describe("locate", () => {
  it("finds exact and case-insensitive quotes, returning transcript text", () => {
    expect(locate("Order 4821 ka customer", "order 4821")).toEqual({ quote: "Order 4821", start: 0, end: 10 });
    expect(locate("abc", "xyz")).toBeNull();
  });
});

const hint = (h: Partial<ReasoningOutput["time"]>): ReasoningOutput["time"] => ({
  quote: "x", kind: "AT", dayOffset: null, weekday: null, startHour: null, startMinute: null, endHour: null, endMinute: null, confidence: 0.8, ...h,
});

describe("resolveTime (Asia/Kolkata)", () => {
  it("resolves 'shaam 6 baje ke baad' today", () => {
    expect(resolveTime(hint({ kind: "AFTER", startHour: 18 }), NOW)).toMatchObject({ kind: "AFTER", start: "2026-11-06T18:00:00+05:30", end: null });
  });
  it("resolves 'kal dopahar 2 baje' tomorrow", () => {
    expect(resolveTime(hint({ dayOffset: 1, startHour: 14 }), NOW)?.start).toBe("2026-11-07T14:00:00+05:30");
  });
  it("resolves a between window", () => {
    expect(resolveTime(hint({ kind: "BETWEEN", startHour: 19, endHour: 20 }), NOW)).toMatchObject({ start: "2026-11-06T19:00:00+05:30", end: "2026-11-06T20:00:00+05:30" });
  });
  it("resolves 'Monday' to the next Monday", () => {
    expect(dayOffsetFor({ dayOffset: null, weekday: "monday" }, NOW)).toBe(3);
    expect(dayOffsetFor({ dayOffset: null, weekday: "friday" }, NOW)).toBe(7); // today is Friday → next week
  });
  it("crosses the IST date line correctly late at night", () => {
    // 2026-11-06T19:00Z is 00:30 IST on 7 Nov — "kal" must mean 8 Nov.
    expect(resolveTime(hint({ dayOffset: 1, startHour: 10 }), "2026-11-06T19:00:00.000Z")?.start).toBe("2026-11-08T10:00:00+05:30");
  });
  it("leaves start null instead of inventing an hour", () => {
    expect(resolveTime(hint({ kind: "AT", startHour: null }), NOW)?.start).toBeNull();
  });
});

describe("normaliseReasoning", () => {
  const transcript = "order char auth do ek customer phone nahi utha raha";
  const base: ReasoningOutput = {
    orderReference: { spoken: "order char auth do ek", confidence: 0.8 },
    issue: { value: "CUSTOMER_UNAVAILABLE", quote: "customer phone nahi utha raha", confidence: 0.9 },
    requestedAction: { value: "MARK_CUSTOMER_UNAVAILABLE", quote: "phone nahi utha raha", confidence: 0.8 },
    time: hint({ quote: null, kind: null }),
    notes: { value: null, quote: null, confidence: 0 },
    ambiguities: [],
  };

  it("derives digits and offsets from quotes", () => {
    const { payload } = normaliseReasoning(base, transcript, NOW);
    expect(payload?.orderReference).toEqual({ value: "4821", evidence: { quote: "order char auth do ek", start: 0, end: 21 }, confidence: 0.8 });
    expect(payload?.requestedAction.evidence?.start).toBe(transcript.indexOf("phone nahi"));
  });

  it("drops an order number the model quoted but the speaker never said", () => {
    const { payload } = normaliseReasoning({ ...base, orderReference: { spoken: "order 4907", confidence: 0.9 } }, transcript, NOW);
    expect(payload?.orderReference.value).toBeNull();
    expect(payload?.ambiguities.join(" ")).toMatch(/not in the transcript/);
  });

  it("rejects output that does not match the schema", () => {
    const out = normaliseReasoning({ orderReference: "4821" }, transcript, NOW);
    expect(out.payload).toBeNull();
    expect(out.error).toBeTruthy();
  });
});

describe("prompts", () => {
  const o = order("ORD-4821");
  it("speaks the agent's language", () => {
    expect(confirmationPrompt(payload(), o, "hi-en")).toContain("reschedule karun");
    expect(confirmationPrompt(payload(), o, "en")).toBe("Order 4821: reschedule the delivery after 06 Nov, 18:00? Please confirm.");
    expect(confirmationPrompt(payload(), o, "hi")).toContain("रीशेड्यूल करूँ");
    expect(PROMPTS.hi.missingOrder).toMatch(/ऑर्डर नंबर/);
  });
});
