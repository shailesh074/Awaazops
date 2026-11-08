import { describe, expect, it } from "vitest";
import { validateExtraction, type ValidateInput } from "@/server/reliability/validate";
import { NOW, ORDERS, TRANSCRIPT, payload } from "./fixtures";

const input = (overrides: Partial<ValidateInput> = {}): ValidateInput => ({
  raw: payload(),
  transcript: TRANSCRIPT,
  transcriptConfidence: null,
  agentId: "AG-1",
  referenceTime: NOW,
  orders: ORDERS,
  ...overrides,
});

const check = (out: ReturnType<typeof validateExtraction>, id: string) => out.checks.find((c) => c.id === id)?.status;

describe("validateExtraction", () => {
  it("verifies a grounded, valid reschedule and builds a confirmation prompt", () => {
    const out = validateExtraction(input());
    expect(out.outcome).toBe("VERIFIED");
    expect(out.resolvedOrder?.id).toBe("ORD-4821");
    expect(out.prompt).toMatch(/Order 4821.*reschedule/);
    expect(out.checks.every((c) => c.status === "PASS" || c.status === "SKIPPED")).toBe(true);
  });

  it("rejects malformed model output instead of coercing it", () => {
    const out = validateExtraction(input({ raw: { orderReference: "4821" } }));
    expect(out.outcome).toBe("NEEDS_CLARIFICATION");
    expect(check(out, "SCHEMA_VALID")).toBe("FAIL");
    expect(out.payload).toBeNull();
  });

  it("drops values whose evidence is not in the transcript", () => {
    const p = payload({
      issue: { value: "WRONG_ADDRESS", evidence: { quote: "address galat hai", start: 0, end: 17 }, confidence: 0.9 },
    });
    const out = validateExtraction(input({ raw: p }));
    expect(out.payload?.issue.value).toBeNull();
    expect(check(out, "EVIDENCE_GROUNDED")).toBe("WARN");
  });

  it("repairs wrong offsets when the quote exists elsewhere", () => {
    const p = payload({ orderReference: { value: "4821", evidence: { quote: "order 4821", start: 0, end: 10 }, confidence: 0.9 } });
    const out = validateExtraction(input({ raw: p }));
    expect(out.outcome).toBe("VERIFIED");
    expect(out.payload?.orderReference.evidence?.start).toBe(TRANSCRIPT.indexOf("order 4821"));
  });

  it("asks for the order when none was spoken", () => {
    const out = validateExtraction(input({ raw: payload({ orderReference: { value: null, evidence: null, confidence: 0 } }) }));
    expect(out.outcome).toBe("NEEDS_CLARIFICATION");
    expect(out.prompt).toMatch(/kaunse order/);
  });

  it("suggests a single near-miss order on the agent's route", () => {
    const transcript = "Sir 7716 wala parcel, customer phone nahi utha rahe.";
    const raw = {
      ...payload(),
      orderReference: { value: "7716", evidence: { quote: "7716", start: 4, end: 8 }, confidence: 0.7 },
      issue: { value: "CUSTOMER_UNAVAILABLE", evidence: { quote: "customer phone nahi utha rahe", start: 21, end: 50 }, confidence: 0.9 },
      requestedAction: { value: "MARK_CUSTOMER_UNAVAILABLE", evidence: { quote: "customer phone nahi utha rahe", start: 21, end: 50 }, confidence: 0.8 },
      timeConstraint: { value: null, evidence: null, confidence: 0 },
    };
    const out = validateExtraction(input({ raw, transcript }));
    expect(out.outcome).toBe("NEEDS_CLARIFICATION");
    expect(check(out, "ORDER_EXISTS")).toBe("FAIL");
    expect(out.prompt).toContain("7761");
    expect(out.resolvedOrder).toBeNull();
  });

  it("refuses an order on another agent's route", () => {
    const transcript = TRANSCRIPT.replace("4821", "3388");
    const raw = payload({ orderReference: { value: "3388", evidence: { quote: "order 3388", start: 6, end: 16 }, confidence: 0.9 } });
    const out = validateExtraction(input({ raw, transcript }));
    expect(out.outcome).toBe("REJECTED");
    expect(check(out, "ORDER_ASSIGNED_TO_AGENT")).toBe("FAIL");
    // The reference did resolve (the order exists) — it is refused, not unknown.
    expect(out.resolvedOrder?.id).toBe("ORD-3388");
  });

  it("refuses changes to a delivered order", () => {
    const transcript = TRANSCRIPT.replace("4821", "4935");
    const raw = payload({ orderReference: { value: "4935", evidence: { quote: "order 4935", start: 6, end: 16 }, confidence: 0.9 } });
    const out = validateExtraction(input({ raw, transcript }));
    expect(out.outcome).toBe("REJECTED");
    expect(check(out, "ACTION_ALLOWED_FOR_STATUS")).toBe("FAIL");
  });

  it("requires a time for reschedules", () => {
    const out = validateExtraction(input({ raw: payload({ timeConstraint: { value: null, evidence: null, confidence: 0 } }) }));
    expect(out.outcome).toBe("NEEDS_CLARIFICATION");
    expect(check(out, "REQUIRED_FIELDS_PRESENT")).toBe("FAIL");
  });

  it("rejects times already in the past", () => {
    const out = validateExtraction(input({ referenceTime: "2026-11-06T14:00:00.000Z" })); // 19:30 IST
    expect(out.outcome).toBe("NEEDS_CLARIFICATION");
    expect(check(out, "TIME_CONSTRAINT_VALID")).toBe("FAIL");
  });

  it("rejects times outside delivery hours", () => {
    const p = payload();
    p.timeConstraint.value = { kind: "AT", start: "2026-11-06T23:00:00+05:30", end: null, spoken: "shaam 6 baje ke baad" };
    const out = validateExtraction(input({ raw: p }));
    expect(check(out, "TIME_CONSTRAINT_VALID")).toBe("FAIL");
  });

  it("asks to repeat when provider confidence is low", () => {
    const out = validateExtraction(input({ transcriptConfidence: 0.3 }));
    expect(out.outcome).toBe("NEEDS_CLARIFICATION");
    expect(check(out, "TRANSCRIPT_CONFIDENCE")).toBe("FAIL");
  });

  it("trusts agent-edited fields without transcript evidence", () => {
    const p = payload({ requestedAction: { value: "MARK_CUSTOMER_UNAVAILABLE", evidence: null, confidence: 1 } });
    const out = validateExtraction(input({ raw: p, agentProvided: ["requestedAction"] }));
    expect(out.outcome).toBe("VERIFIED");
    expect(out.payload?.requestedAction.value).toBe("MARK_CUSTOMER_UNAVAILABLE");
  });
});
