import "server-only";
import {
  assertTransition,
  canTransition,
  type ActionType,
  type ExtractionPayload,
  type LanguageCode,
  type PipelineStage,
  type Priority,
  type ReportDetail,
  type ReportStatus,
  type StageTiming,
} from "@/domain";
import { getRepository, type OperationsRepository, type StoredReport } from "@/server/repositories";
import { getSttProvider, type AudioInput } from "@/server/providers/stt";
import { getReasoningProvider } from "@/server/providers/llm";
import { getTtsProvider } from "@/server/providers/tts";
import { ProviderError } from "@/server/providers/errors";
import { validateExtraction, type ValidateOutput } from "@/server/reliability/validate";
import { normaliseReasoning } from "@/server/reliability/normalise";
import { applyAction } from "@/server/actions/apply-action";
import { isActionAllowed } from "@/server/reliability/policy";
import { ReportError } from "./errors";

export type StageEvent =
  | { type: "stage"; stage: PipelineStage; state: "start" }
  | { type: "stage"; stage: PipelineStage; state: "done"; latencyMs: number };

export interface SubmitInput {
  agentId: string;
  language: LanguageCode;
  audio: AudioInput | null;
  /** Honoured by the mock STT provider only; real providers transcribe the audio. */
  mockTranscript?: string;
}

const now = () => new Date().toISOString();

async function timed<T>(
  stage: PipelineStage,
  timings: StageTiming[],
  emit: (e: StageEvent) => void,
  fn: () => Promise<T>,
): Promise<T> {
  emit({ type: "stage", stage, state: "start" });
  const t0 = performance.now();
  const result = await fn();
  const latencyMs = Math.round(performance.now() - t0);
  timings.push({ stage, latencyMs });
  emit({ type: "stage", stage, state: "done", latencyMs });
  return result;
}

function transition(stored: StoredReport, to: ReportStatus) {
  assertTransition(stored.report.status, to);
  stored.report.status = to;
  stored.report.updatedAt = now();
}

function derivePriority(base: Priority | undefined, payload: ExtractionPayload | null): Priority {
  const issue = payload?.issue.value;
  if (issue === "PACKAGE_UNDELIVERABLE") return "CRITICAL";
  if (issue === "WRONG_ADDRESS" && (base === "LOW" || base === "MEDIUM" || !base)) return "HIGH";
  return base ?? "MEDIUM";
}

/** Persist validation output onto the stored report and move it to the matching state. */
async function applyValidation(repo: OperationsRepository, stored: StoredReport, v: ValidateOutput) {
  stored.validation = {
    reportId: stored.report.id,
    outcome: v.outcome,
    checks: v.checks,
    resolvedOrderId: v.resolvedOrder?.id ?? null,
    clarificationQuestion: v.outcome === "VERIFIED" ? null : v.prompt,
  };
  if (stored.extraction && v.payload) stored.extraction.payload = v.payload;
  stored.confirmationPrompt = v.prompt;

  if (v.outcome === "VERIFIED") transition(stored, "VALIDATED");
  else transition(stored, v.outcome === "REJECTED" ? "REJECTED" : "NEEDS_CLARIFICATION");

  const orders = await repo.listOrders();
  const spokenDigits = v.payload?.orderReference.value?.replace(/\D/g, "");
  const order = v.resolvedOrder ?? orders.find((o) => o.id === `ORD-${spokenDigits}`);
  stored.priority = derivePriority(order?.priority, v.payload);
}

/**
 * Voice → Intelligence → Verification. Runs STT, reasoning and validation, then prepares the
 * confirmation prompt. Never executes an action: that requires `confirmReport`.
 */
export async function submitReport(input: SubmitInput, emit: (e: StageEvent) => void = () => {}): Promise<ReportDetail> {
  const repo = getRepository();
  const stt = getSttProvider();
  if (!input.audio && stt.id !== "mock-stt") throw new ReportError("BAD_REQUEST", "Audio is required.");
  const createdAt = now();
  const timings: StageTiming[] = [];
  const stored: StoredReport = {
    report: {
      id: await repo.nextReportId(),
      agentId: input.agentId,
      language: input.language,
      status: "RECORDED",
      audioPath: null, // audio storage arrives with Supabase Storage (step 8)
      audioDurationMs: input.audio?.durationMs ?? null,
      failureReason: null,
      timings,
      timingSource: "measured",
      createdAt,
      updatedAt: createdAt,
    },
    transcript: null,
    extraction: null,
    validation: null,
    actionId: null,
    priority: "MEDIUM",
    confirmationPrompt: null,
  };
  const id = stored.report.id;
  await repo.saveReport(stored);
  await repo.appendAudit({ actorId: input.agentId, actorRole: "AGENT", entity: "REPORT", entityId: id, reportId: id, event: "REPORT_SUBMITTED", before: null, after: { language: input.language, audioBytes: input.audio?.data.byteLength ?? 0 }, createdAt });

  try {
    // 1. Speech-to-text
    const audio = input.audio ?? { data: new ArrayBuffer(0), mimeType: "audio/none" };
    const transcription = await timed("stt", timings, emit, () =>
      stt.transcribe(audio, { language: input.language, mockTranscript: input.mockTranscript }),
    );
    if (!transcription.text.trim()) throw new ProviderError(stt.id, "INVALID_RESPONSE", "No speech detected in the recording.");
    stored.transcript = {
      id: `${id}-T`,
      reportId: id,
      text: transcription.text,
      language: input.language,
      confidence: transcription.confidence,
      segments: transcription.segments,
      provenance: transcription.provenance,
    };
    transition(stored, "TRANSCRIBED");

    // 2. Reasoning (untrusted output)
    const referenceTime = now();
    const reasoning = await timed("reasoning", timings, emit, () =>
      getReasoningProvider().extract({ transcript: transcription.text, language: input.language, referenceTime }),
    );
    transition(stored, "EXTRACTED");

    // 3. Normalise (quotes → offsets, spoken numbers → digits, hints → IST times), then verify
    //    against the database. Both are deterministic; the model did none of this.
    const orders = await repo.listOrders();
    const v = await timed("validation", timings, emit, async () => {
      const normalised = normaliseReasoning(reasoning.raw, transcription.text, referenceTime);
      return validateExtraction({
        raw: normalised.payload,
        rawError: normalised.error,
        transcript: transcription.text,
        transcriptConfidence: transcription.confidence,
        agentId: input.agentId,
        referenceTime,
        orders,
        language: input.language,
      });
    });
    stored.extraction = v.payload
      ? { id: `${id}-X`, reportId: id, payload: v.payload, provenance: reasoning.provenance }
      : null;
    await applyValidation(repo, stored, v);
    await repo.appendAudit({ actorId: "system", actorRole: "SYSTEM", entity: "REPORT", entityId: id, reportId: id, event: "VALIDATION_COMPLETED", before: null, after: { outcome: v.outcome }, createdAt: now() });

    // 4. Spoken prompt. Non-fatal: if speech synthesis fails the agent still gets the prompt as text.
    try {
      await timed("tts", timings, emit, () => getTtsProvider().synthesize(v.prompt, { language: input.language }));
    } catch (err) {
      console.warn(`[pipeline] ${id} TTS unavailable:`, err instanceof Error ? err.message : err);
    }
    if (v.outcome === "VERIFIED") transition(stored, "AWAITING_CONFIRMATION");
  } catch (err) {
    stored.report.failureReason =
      err instanceof ProviderError ? err.message : "Unexpected error while processing the report.";
    if (canTransition(stored.report.status, "FAILED")) transition(stored, "FAILED");
    await repo.appendAudit({ actorId: "system", actorRole: "SYSTEM", entity: "REPORT", entityId: id, reportId: id, event: "PIPELINE_FAILED", before: null, after: { reason: stored.report.failureReason }, createdAt: now() });
    if (!(err instanceof ProviderError)) console.error(`[pipeline] ${id}`, err);
  }

  await repo.saveReport(stored);
  return (await repo.getReport(id))!;
}

async function loadOwned(repo: OperationsRepository, id: string, agentId: string): Promise<StoredReport> {
  const stored = await repo.getStoredReport(id);
  if (!stored) throw new ReportError("NOT_FOUND", `Report ${id} not found.`);
  if (stored.report.agentId !== agentId) throw new ReportError("FORBIDDEN", "Only the reporting agent can act on this report.");
  return stored;
}

/** Agent correction. Edited fields are trusted as the agent's own words and re-verified. */
export async function editReport(
  id: string,
  agentId: string,
  edit: { orderReference?: string; requestedAction?: ActionType; notes?: string | null },
): Promise<ReportDetail> {
  const repo = getRepository();
  const stored = await loadOwned(repo, id, agentId);
  if (!stored.extraction || !stored.transcript) throw new ReportError("INVALID_STATE", "This report has nothing to edit.");
  if (stored.report.status !== "AWAITING_CONFIRMATION" && stored.report.status !== "NEEDS_CLARIFICATION")
    throw new ReportError("INVALID_STATE", `Cannot edit a report that is ${stored.report.status}.`);

  const before = structuredClone(stored.extraction.payload);
  const payload = structuredClone(before);
  const agentProvided: Array<"orderReference" | "requestedAction" | "notes"> = [];
  if (edit.orderReference !== undefined) {
    payload.orderReference = { value: edit.orderReference, evidence: null, confidence: 1 };
    agentProvided.push("orderReference");
  }
  if (edit.requestedAction !== undefined) {
    payload.requestedAction = { value: edit.requestedAction, evidence: null, confidence: 1 };
    agentProvided.push("requestedAction");
  }
  if (edit.notes !== undefined) {
    payload.notes = { value: edit.notes, evidence: null, confidence: 1 };
    agentProvided.push("notes");
  }

  transition(stored, "EDITED");
  const t0 = performance.now();
  const v = validateExtraction({
    raw: payload,
    transcript: stored.transcript.text,
    transcriptConfidence: stored.transcript.confidence,
    agentId,
    referenceTime: now(),
    orders: await repo.listOrders(),
    agentProvided,
    language: stored.report.language,
  });
  stored.report.timings = [...stored.report.timings.filter((t) => t.stage !== "validation"), { stage: "validation", latencyMs: Math.round(performance.now() - t0) }];
  await applyValidation(repo, stored, v);
  if (v.outcome === "VERIFIED") transition(stored, "AWAITING_CONFIRMATION");

  await repo.appendAudit({ actorId: agentId, actorRole: "AGENT", entity: "REPORT", entityId: id, reportId: id, event: "REPORT_EDITED", before: { fields: agentProvided.map((f) => [f, before[f].value]) }, after: { fields: agentProvided.map((f) => [f, payload[f].value]), outcome: v.outcome }, createdAt: now() });
  await repo.saveReport(stored);
  return (await repo.getReport(id))!;
}

/**
 * The only path to an operational write. Requires AWAITING_CONFIRMATION, re-checks the order at the
 * moment of confirmation (it may have changed), then executes and audits.
 */
export async function confirmReport(id: string, agentId: string): Promise<ReportDetail> {
  const repo = getRepository();
  const stored = await loadOwned(repo, id, agentId);
  if (stored.report.status !== "AWAITING_CONFIRMATION")
    throw new ReportError("INVALID_STATE", `Only reports awaiting confirmation can be confirmed (this one is ${stored.report.status}).`);

  const payload = stored.extraction?.payload;
  const action = payload?.requestedAction.value;
  const orderId = stored.validation?.resolvedOrderId;
  if (!payload || !action || !orderId) throw new ReportError("INVALID_STATE", "Report has no verified action.");

  transition(stored, "CONFIRMED");
  const confirmedAt = now();
  await repo.appendAudit({ actorId: agentId, actorRole: "AGENT", entity: "REPORT", entityId: id, reportId: id, event: "ACTION_CONFIRMED", before: { status: "AWAITING_CONFIRMATION" }, after: { status: "CONFIRMED", action }, createdAt: confirmedAt });

  const order = await repo.getOrder(orderId);
  if (!order || order.assignedAgentId !== agentId || !isActionAllowed(action, order.status)) {
    transition(stored, "FAILED");
    stored.report.failureReason = `Order ${orderId} changed before confirmation; nothing was updated.`;
    await repo.appendAudit({ actorId: "system", actorRole: "SYSTEM", entity: "REPORT", entityId: id, reportId: id, event: "PIPELINE_FAILED", before: null, after: { reason: stored.report.failureReason }, createdAt: now() });
    await repo.saveReport(stored);
    return (await repo.getReport(id))!;
  }

  const t0 = performance.now();
  const executedAt = now();
  const applied = applyAction(order, action, payload, executedAt);
  await repo.updateOrder(applied.order);
  const actionId = `${id}-A`;
  await repo.saveAction({ id: actionId, reportId: id, orderId, type: action, payload: applied.actionPayload, status: "EXECUTED", confirmedBy: agentId, confirmedAt, executedAt });
  stored.actionId = actionId;
  stored.report.timings = [...stored.report.timings, { stage: "execution", latencyMs: Math.round(performance.now() - t0) }];
  transition(stored, "EXECUTED");

  await repo.appendAudit({ actorId: "system", actorRole: "SYSTEM", entity: "ACTION", entityId: actionId, reportId: id, event: "ACTION_EXECUTED", before: null, after: { type: action, ...applied.actionPayload }, createdAt: executedAt });
  await repo.appendAudit({ actorId: "system", actorRole: "SYSTEM", entity: "ORDER", entityId: orderId, reportId: id, event: "ORDER_UPDATED", before: { status: order.status, instructions: order.instructions, slotStart: order.slotStart, slotEnd: order.slotEnd }, after: { status: applied.order.status, instructions: applied.order.instructions, slotStart: applied.order.slotStart, slotEnd: applied.order.slotEnd }, createdAt: executedAt });

  await repo.saveReport(stored);
  return (await repo.getReport(id))!;
}

export async function rejectReport(id: string, agentId: string): Promise<ReportDetail> {
  const repo = getRepository();
  const stored = await loadOwned(repo, id, agentId);
  const from = stored.report.status;
  if (from !== "AWAITING_CONFIRMATION" && from !== "NEEDS_CLARIFICATION")
    throw new ReportError("INVALID_STATE", `Cannot reject a report that is ${from}.`);
  transition(stored, "REJECTED");
  await repo.appendAudit({ actorId: agentId, actorRole: "AGENT", entity: "REPORT", entityId: id, reportId: id, event: "REPORT_REJECTED", before: { status: from }, after: { status: "REJECTED" }, createdAt: now() });
  await repo.saveReport(stored);
  return (await repo.getReport(id))!;
}
