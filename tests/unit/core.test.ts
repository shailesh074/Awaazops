import { describe, expect, it } from "vitest";
import { canTransition, REPORT_STATUSES } from "@/domain";
import { isNearMiss, orderDigits, suggestOrder } from "@/server/reliability/order-reference";
import { applyAction } from "@/server/actions/apply-action";
import { diffWords, scoreSample, wordErrorRate } from "@/lib/lab-metrics";
import { LAB_RUNS, LAB_SAMPLES } from "@/mocks/lab";
import { NOW, order, payload } from "./fixtures";

describe("report lifecycle", () => {
  it("reaches EXECUTED only from CONFIRMED", () => {
    for (const from of REPORT_STATUSES) {
      expect(canTransition(from, "EXECUTED")).toBe(from === "CONFIRMED");
    }
  });
  it("reaches CONFIRMED only from AWAITING_CONFIRMATION", () => {
    for (const from of REPORT_STATUSES) {
      expect(canTransition(from, "CONFIRMED")).toBe(from === "AWAITING_CONFIRMATION");
    }
  });
  it("treats terminal states as final", () => {
    for (const to of REPORT_STATUSES) {
      expect(canTransition("EXECUTED", to)).toBe(false);
      expect(canTransition("REJECTED", to)).toBe(false);
    }
  });
});

describe("order references", () => {
  it("extracts digits from common forms", () => {
    expect(orderDigits("ORD-4821")).toBe("4821");
    expect(orderDigits("#4821")).toBe("4821");
    expect(orderDigits("order 4821")).toBe("4821");
    expect(orderDigits("chaar aath")).toBeNull();
  });
  it("detects single substitutions and adjacent transpositions only", () => {
    expect(isNearMiss("7716", "7761")).toBe(true);
    expect(isNearMiss("4821", "4822")).toBe(true);
    expect(isNearMiss("4821", "1284")).toBe(false);
    expect(isNearMiss("4821", "4821")).toBe(false);
  });
  it("does not guess between several near-misses", () => {
    expect(suggestOrder("4820", [order("ORD-4821"), order("ORD-4829")])).toBeNull();
    expect(suggestOrder("4820", [order("ORD-4821")])?.id).toBe("ORD-4821");
  });
});

describe("applyAction", () => {
  it("reschedules into a two-hour slot from an AFTER constraint", () => {
    const { order: next } = applyAction(order("ORD-4821"), "RESCHEDULE", payload(), NOW);
    expect(next.status).toBe("RESCHEDULED");
    expect(next.slotStart).toBe("2026-11-06T12:30:00.000Z");
    expect(next.slotEnd).toBe("2026-11-06T14:30:00.000Z");
  });
  it("updates instructions from notes", () => {
    const p = payload({ notes: { value: "Leave at reception", evidence: null, confidence: 1 } });
    const { order: next } = applyAction(order("ORD-4821"), "UPDATE_INSTRUCTIONS", p, NOW);
    expect(next.instructions).toBe("Leave at reception");
    expect(next.status).toBe("OUT_FOR_DELIVERY");
  });
});

describe("lab metrics", () => {
  it("computes word error rate", () => {
    expect(wordErrorRate("order 6120 ka box", "order 6112 ka box")).toBeCloseTo(0.25);
    expect(wordErrorRate("a b c", "a b c")).toBe(0);
  });
  it("diffs words", () => {
    const kinds = diffWords("order 6120 ka", "order 6112 ka").map((t) => t.kind);
    expect(kinds).toEqual(["same", "missing", "added", "same"]);
  });
  it("counts a misheard order caught by verification as safe", () => {
    const sample = LAB_SAMPLES.find((s) => s.id === "L-03")!;
    const result = LAB_RUNS[0].results.find((r) => r.sampleId === "L-03")!;
    const score = scoreSample(sample, result);
    expect(score.fields.orderReference).toBe(false);
    expect(score.caughtByVerification).toBe(true);
    expect(score.unsafe).toBe(false);
  });
});
