import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The app configured for an optional LLM that is unavailable (no key): every report must still be
// processed — by the deterministic rules — and the fallback must be recorded, never hidden.

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T14:00:00+05:30"));
  vi.resetModules();
  vi.stubEnv("AWAAZ_REASONING_PROVIDER", "claude");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("pipeline with an unavailable LLM", () => {
  it("falls back to rules, completes the report and records the fallback", async () => {
    const { submitReport } = await import("@/server/pipeline/process-report");
    const { getRepository } = await import("@/server/repositories");
    const { getProviderStatus } = await import("@/server/providers/status");

    const r = await submitReport({
      agentId: "AG-101",
      language: "hi-en",
      audio: null,
      mockTranscript: "Order 4952 ka customer ghar pe nahi hai, kal subah aana.",
    });

    expect(r.report.status).toBe("AWAITING_CONFIRMATION");
    expect(r.extraction?.provenance).toMatchObject({ provider: "rules", simulated: false, fallbackFrom: "claude", fallbackReason: "not configured" });

    const audit = (await getRepository().listAudit()).find((e) => e.reportId === r.report.id && e.event === "VALIDATION_COMPLETED");
    expect(audit?.after).toMatchObject({ reasoning: { provider: "rules", fallbackFrom: "claude", fallbackReason: "not configured" } });

    const reasoning = getProviderStatus().find((p) => p.stage === "reasoning");
    expect(reasoning).toMatchObject({ provider: "claude", kind: "ai", configured: false, fallback: "rules" });
  });
});
