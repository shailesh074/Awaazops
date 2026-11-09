import "server-only";
import { randomUUID } from "node:crypto";
import type { LabResult, LabRun, PipelineStage } from "@/domain";
import { getRepository } from "@/server/repositories";
import { getSttProvider } from "@/server/providers/stt";
import { getReasoningProvider } from "@/server/providers/reasoning";
import { normaliseReasoning } from "@/server/reliability/normalise";
import { validateExtraction } from "@/server/reliability/validate";
import { ReportError } from "@/server/pipeline/errors";

export type LabProgress =
  | { type: "start"; runId: string; total: number }
  | { type: "sample"; index: number; total: number; sampleId: string; ok: boolean; error?: string };

/**
 * Runs every stored Lab sample through the real pipeline — speech-to-text, reasoning, normaliser and
 * database verification — measuring each stage. Nothing here is simulated: the run refuses to start on the
 * mock speech-to-text provider, and a sample that fails is recorded as failed (never scored as a success).
 *
 * Scope: the Lab measures recognition and verification, not route assignment, so each sample is verified
 * as the agent assigned to the order it names (an unknown order is still an unknown order).
 */
export async function runLabBenchmark(createdBy: string, emit: (p: LabProgress) => void = () => {}): Promise<LabRun> {
  const repo = getRepository();
  const stt = getSttProvider();
  if (stt.id === "mock-stt") {
    throw new ReportError("INVALID_STATE", "Speech-to-text is simulated. Configure Gnani Prisma to run the benchmark.");
  }
  const samples = await repo.listLabSamples();
  if (samples.length === 0) throw new ReportError("BAD_REQUEST", "Add at least one sample before running the benchmark.");

  const reasoning = getReasoningProvider();
  const orders = await repo.listOrders();
  const run = {
    id: `LR-${randomUUID().slice(0, 8)}`,
    label: `${samples.length} sample${samples.length === 1 ? "" : "s"} · ${stt.id} + ${reasoning.id}`,
    status: "running" as LabRun["status"],
    providers: { stt: stt.id, reasoning: reasoning.id },
    sampleCount: samples.length,
    createdBy,
    createdAt: new Date().toISOString(),
    completedAt: null as string | null,
  };
  await repo.saveLabRun(run);
  emit({ type: "start", runId: run.id, total: samples.length });

  for (const [index, sample] of samples.entries()) {
    const latency: Partial<Record<PipelineStage, number>> = {};
    const timed = async <T,>(stage: PipelineStage, fn: () => Promise<T> | T): Promise<T> => {
      const t0 = performance.now();
      try {
        return await fn();
      } finally {
        latency[stage] = Math.round(performance.now() - t0);
      }
    };

    let result: LabResult;
    try {
      const audio = await repo.getLabAudio(sample.audioPath);
      if (!audio) throw new Error("Sample audio is missing from storage.");

      const transcription = await timed("stt", () =>
        stt.transcribe({ data: audio.data, mimeType: audio.mimeType, durationMs: sample.durationMs }, { language: sample.language }),
      );
      if (!transcription.text.trim()) throw new Error("No speech detected.");

      const referenceTime = new Date().toISOString();
      const extracted = await timed("reasoning", () =>
        reasoning.extract({ transcript: transcription.text, language: sample.language, referenceTime }),
      );
      const v = await timed("validation", () => {
        const normalised = normaliseReasoning(extracted.raw, transcription.text, referenceTime);
        const digits = normalised.payload?.orderReference.value ?? null;
        const named = digits ? orders.find((o) => o.id === `ORD-${digits}`) : undefined;
        return validateExtraction({
          raw: normalised.payload,
          rawError: normalised.error,
          transcript: transcription.text,
          transcriptConfidence: transcription.confidence,
          agentId: named?.assignedAgentId ?? "LAB",
          referenceTime,
          orders,
          language: sample.language,
        });
      });

      result = {
        sampleId: sample.id,
        transcript: transcription.text,
        payload: v.payload,
        validationOutcome: v.outcome,
        stageLatencyMs: latency,
        simulated: transcription.provenance.simulated,
        error: v.payload ? null : "Reasoning output was unusable.",
        provenance: { stt: transcription.provenance, reasoning: extracted.provenance },
      };
    } catch (err) {
      result = {
        sampleId: sample.id,
        transcript: "",
        payload: null,
        validationOutcome: null,
        stageLatencyMs: latency,
        simulated: false,
        error: err instanceof Error ? err.message.replace(/^\[[^\]]+\]\s*/, "") : "Processing failed.",
      };
    }
    await repo.saveLabResult(run.id, result);
    emit({ type: "sample", index: index + 1, total: samples.length, sampleId: sample.id, ok: !result.error, error: result.error ?? undefined });
  }

  await repo.saveLabRun({ ...run, status: "completed", completedAt: new Date().toISOString() });
  return (await repo.getLatestLabRun())!;
}
