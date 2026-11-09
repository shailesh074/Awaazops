import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// A spoken reply to the confirmation prompt: only a clear yes confirms, only a clear no rejects, and an
// unclear reply changes nothing. The decision and what was heard are recorded in the audit trail.

let nextTranscript = "";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T14:00:00+05:30"));
  vi.resetModules();
  vi.doMock("@/server/providers/stt", () => ({
    getSttProvider: () => ({
      id: "gnani-prisma",
      isConfigured: () => true,
      transcribe: async () => ({
        text: nextTranscript,
        confidence: null,
        segments: [],
        provenance: { provider: "gnani-prisma", model: "test", simulated: false, latencyMs: 1, createdAt: new Date().toISOString() },
      }),
    }),
  }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => {
  vi.doUnmock("@/server/providers/stt");
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const audio = { data: new Uint8Array([1, 2, 3]).buffer, mimeType: "audio/wav", durationMs: 1500 };

async function newReport() {
  const { submitReport } = await import("@/server/pipeline/process-report");
  nextTranscript = "Order 4952 ka customer ghar pe nahi hai, kal subah aana.";
  const r = await submitReport({ agentId: "AG-101", language: "hi-en", audio });
  expect(r.report.status).toBe("AWAITING_CONFIRMATION");
  return r.report.id;
}

describe("spoken confirmation", () => {
  it("does nothing on an unclear reply, and logs what was heard", async () => {
    const { answerByVoice } = await import("@/server/pipeline/process-report");
    const { getRepository } = await import("@/server/repositories");
    const id = await newReport();
    nextTranscript = "haan but slot change karo";
    const r = await answerByVoice(id, "AG-101", audio, "hi-en");
    expect(r.decision).toBe("unclear");
    expect(r.report.report.status).toBe("AWAITING_CONFIRMATION");
    const audit = (await getRepository().listAudit()).filter((e) => e.reportId === id);
    expect(audit.some((e) => e.event === "SPOKEN_REPLY_UNCLEAR" && (e.after as { heard: string }).heard === nextTranscript)).toBe(true);
    expect(audit.some((e) => e.event === "ACTION_CONFIRMED")).toBe(false);
  });

  it("confirms and executes on a clear yes, recording the voice channel", async () => {
    const { answerByVoice } = await import("@/server/pipeline/process-report");
    const { getRepository } = await import("@/server/repositories");
    const id = await newReport();
    nextTranscript = "haan ji";
    const r = await answerByVoice(id, "AG-101", audio, "hi-en");
    expect(r.decision).toBe("yes");
    expect(r.report.report.status).toBe("EXECUTED");
    const confirmed = (await getRepository().listAudit()).find((e) => e.reportId === id && e.event === "ACTION_CONFIRMED");
    expect(confirmed?.after).toMatchObject({ via: { channel: "voice", heard: "haan ji", sttProvider: "gnani-prisma" } });
  });

  it("rejects on a clear no", async () => {
    const { answerByVoice } = await import("@/server/pipeline/process-report");
    const id = await newReport();
    nextTranscript = "nahi, cancel karo";
    const r = await answerByVoice(id, "AG-101", audio, "hi-en");
    expect(r.decision).toBe("no");
    expect(r.report.report.status).toBe("REJECTED");
  });

  it("refuses a reply from another agent and for a report not awaiting confirmation", async () => {
    const { answerByVoice } = await import("@/server/pipeline/process-report");
    const id = await newReport();
    nextTranscript = "haan";
    await expect(answerByVoice(id, "AG-103", audio, "hi-en")).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND|FORBIDDEN/) });
    await answerByVoice(id, "AG-101", audio, "hi-en");
    await expect(answerByVoice(id, "AG-101", audio, "hi-en")).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});
