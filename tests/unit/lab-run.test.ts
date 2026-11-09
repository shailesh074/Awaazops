import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { scoreSample, summarizeRun } from "@/lib/lab-metrics";
import type { LabResult, LabSample } from "@/domain";

const sample = (over: Partial<LabSample> = {}): LabSample => ({
  id: "LS-1",
  title: "t",
  language: "hi-en",
  accent: "x",
  noise: "clean",
  durationMs: 3000,
  referenceTranscript: null,
  expected: { orderReference: "4952", issue: "CUSTOMER_UNAVAILABLE", requestedAction: "MARK_CUSTOMER_UNAVAILABLE", expectsClarification: false },
  ...over,
});

describe("lab metrics with measured edge cases", () => {
  it("scores a failed sample as failed, never as correct, and excludes it from latency", () => {
    const failed: LabResult = { sampleId: "LS-1", transcript: "", payload: null, validationOutcome: null, stageLatencyMs: { stt: 900 }, simulated: false, error: "No speech detected." };
    const s = scoreSample(sample(), failed);
    expect(s.failed).toBe(true);
    expect(s.correctCount).toBe(0);
    const summary = summarizeRun([s], [failed]);
    expect(summary.failed).toBe(1);
    expect(summary.p50TotalMs).toBe(0);
  });

  it("reports WER as unavailable when no reference transcript exists — never a made-up number", () => {
    const r: LabResult = { sampleId: "LS-1", transcript: "order 4952", payload: null, validationOutcome: null, stageLatencyMs: {}, simulated: false, error: "x" };
    const s = scoreSample(sample({ referenceTranscript: null }), r);
    expect(s.wer).toBeNull();
    expect(summarizeRun([s], [r]).meanWer).toBeNull();
  });
});

let transcripts: Record<string, string> = {};

describe("lab benchmark runner", () => {
  beforeAll(() => {
    vi.resetModules();
    vi.doMock("@/server/providers/stt", () => ({
      getSttProvider: () => ({
        id: "gnani-prisma",
        isConfigured: () => true,
        transcribe: async (audio: { data: ArrayBuffer }) => {
          const key = new TextDecoder().decode(audio.data);
          if (!(key in transcripts)) throw new Error("[gnani-prisma] upstream 500");
          return { text: transcripts[key], confidence: null, segments: [], provenance: { provider: "gnani-prisma", model: "test", simulated: false, latencyMs: 1, createdAt: new Date().toISOString() } };
        },
      }),
    }));
  });
  afterAll(() => {
    vi.doUnmock("@/server/providers/stt");
  });

  it("runs stored samples through the real pipeline, records failures, and persists the run", async () => {
    const { getRepository } = await import("@/server/repositories");
    const { runLabBenchmark } = await import("@/server/lab/run-lab");
    const repo = getRepository();
    const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
    const base = { accent: "x", noise: "clean" as const, durationMs: 3000, mimeType: "audio/wav", createdBy: "t", createdAt: new Date().toISOString() };
    transcripts = { good: "Order 4952 ka customer ghar pe nahi hai" };
    await repo.saveLabSample(
      { ...sample({ id: "LS-good", referenceTranscript: "order 4952 ka customer ghar pe nahi hai" }), ...base, audioPath: "LS-good.wav" },
      { data: enc("good"), mimeType: "audio/wav" },
    );
    await repo.saveLabSample({ ...sample({ id: "LS-bad" }), ...base, audioPath: "LS-bad.wav" }, { data: enc("bad"), mimeType: "audio/wav" });

    const events: string[] = [];
    const run = await runLabBenchmark("tester", (p) => events.push(p.type));
    expect(events).toEqual(["start", "sample", "sample"]);
    expect(run.status).toBe("completed");
    const good = run.results.find((r) => r.sampleId === "LS-good")!;
    const bad = run.results.find((r) => r.sampleId === "LS-bad")!;
    expect(good.validationOutcome).toBe("VERIFIED");
    expect(good.payload?.orderReference.value).toBe("4952");
    expect(good.stageLatencyMs.stt).toBeTypeOf("number");
    expect(bad.payload).toBeNull();
    expect(bad.error).toBe("upstream 500");
    expect((await repo.getLatestLabRun())?.id).toBe(run.id);
  });
});

describe("lab benchmark on simulated speech-to-text", () => {
  it("refuses to run rather than produce simulated metrics", async () => {
    vi.resetModules();
    vi.doUnmock("@/server/providers/stt");
    const { runLabBenchmark } = await import("@/server/lab/run-lab");
    await expect(runLabBenchmark("tester")).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});
