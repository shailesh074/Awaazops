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
import { getRepository, OrderChangedError, type OperationsRepository, type StoredReport } from "@/server/repositories";
import { getSttProvider, type AudioInput } from "@/server/providers/stt";
import { getReasoningProvider } from "@/server/providers/reasoning";
import { getTtsProvider } from "@/server/providers/tts";
import { ProviderError } from "@/server/providers/errors";
import { validateExtraction, type ValidateOutput } from "@/server/reliability/validate";
import { normaliseReasoning } from "@/server/reliability/normalise";
import { applyAction } from "@/server/actions/apply-action";
import { isActionAllowed } from "@/server/reliability/policy";
import { classifySpokenReply, type SpokenDecision } from "@/lib/spoken-reply";
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
 * What the acting agent may see of a report. The pipeline reads with the service role (RLS bypassed), so
 * it must not hand back another agent's order — e.g. a report REJECTED because the spoken order belongs
 * to a colleague still resolves to that order, whose customer details are not this agent's to see.
 */
export function agentView(detail: ReportDetail | null, agentId: string): ReportDetail {
  if (!detail) throw new ReportError("NOT_FOUND", "Report not found.");
  if (detail.order && detail.order.assignedAgentId !== agentId) return { ...detail, order: null };
  return detail;
}

/**
 * Synthesizes the agent-facing prompt and stores the audio with the exact text it was made from.
 * Never throws: a voice outage must not block operations — the prompt is still shown as text.
 */
async function speakPrompt(repo: OperationsRepository, reportId: string, text: string, language: LanguageCode): Promise<void> {
  try {
    const result = await getTtsProvider().synthesize(text, { language });
    if (result.audio && result.mimeType) {
      await repo.savePromptAudio(reportId, { data: result.audio, mimeType: result.mimeType, text, provenance: result.provenance });
    }
  } catch (err) {
    console.warn(`[pipeline] ${reportId} TTS unavailable:`, err instanceof Error ? err.message : err);
  }
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
  // Keep the original recording as evidence. Non-fatal: a storage outage must not block the report.
  if (input.audio && input.audio.data.byteLength > 0) {
    try {
      stored.report.audioPath = await repo.saveRecording(id, input.agentId, { data: input.audio.data, mimeType: input.audio.mimeType });
    } catch (err) {
      console.warn(`[pipeline] ${id} recording not stored:`, err instanceof Error ? err.message : err);
    }
  }
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
    await repo.appendAudit({ actorId: "system", actorRole: "SYSTEM", entity: "REPORT", entityId: id, reportId: id, event: "VALIDATION_COMPLETED", before: null, after: { outcome: v.outcome, reasoning: { provider: reasoning.provenance.provider, model: reasoning.provenance.model ?? null, fallbackFrom: reasoning.provenance.fallbackFrom ?? null, fallbackReason: reasoning.provenance.fallbackReason ?? null } }, createdAt: now() });

    // 4. Spoken prompt. Non-fatal: if speech synthesis fails the agent still gets the prompt as text.
    await timed("tts", timings, emit, () => speakPrompt(repo, id, v.prompt, input.language));
    if (v.outcome === "VERIFIED") transition(stored, "AWAITING_CONFIRMATION");
  } catch (err) {
    stored.report.failureReason =
      err instanceof ProviderError ? err.message : "Unexpected error while processing the report.";
    if (canTransition(stored.report.status, "FAILED")) transition(stored, "FAILED");
    await repo.appendAudit({ actorId: "system", actorRole: "SYSTEM", entity: "REPORT", entityId: id, reportId: id, event: "PIPELINE_FAILED", before: null, after: { reason: stored.report.failureReason }, createdAt: now() });
    if (!(err instanceof ProviderError)) console.error(`[pipeline] ${id}`, err);
  }

  await repo.saveReport(stored);
  return agentView(await repo.getReport(id), input.agentId);
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
    payload.orderReference = { value: edit.orderReference, evidence: null, confidence: null };
    agentProvided.push("orderReference");
  }
  if (edit.requestedAction !== undefined) {
    payload.requestedAction = { value: edit.requestedAction, evidence: null, confidence: null };
    agentProvided.push("requestedAction");
  }
  if (edit.notes !== undefined) {
    payload.notes = { value: edit.notes, evidence: null, confidence: null };
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
  // The prompt changed with the edit; speak the new one.
  await speakPrompt(repo, id, v.prompt, stored.report.language);

  await repo.appendAudit({ actorId: agentId, actorRole: "AGENT", entity: "REPORT", entityId: id, reportId: id, event: "REPORT_EDITED", before: { fields: agentProvided.map((f) => [f, before[f].value]) }, after: { fields: agentProvided.map((f) => [f, payload[f].value]), outcome: v.outcome }, createdAt: now() });
  await repo.saveReport(stored);
  return agentView(await repo.getReport(id), agentId);
}

/** How a decision reached the server: a button tap, a spoken reply (with what was heard), or a dispatcher. */
export type DecisionChannel =
  | { channel: "tap" }
  | { channel: "voice"; heard: string; sttProvider: string; sttModel: string | null }
  | { channel: "dispatcher"; note: string | null };

interface Confirmer {
  actorId: string;
  actorRole: "AGENT" | "DISPATCHER";
  via: DecisionChannel;
}

/**
 * The only path to an operational write. Called once a person has decided (the agent on AWAITING_CONFIRMATION,
 * or a dispatcher on an ESCALATED report after re-verification). Moves the report to CONFIRMED, re-checks the
 * order at that moment (it may have changed), then commits order update, action record, EXECUTED and audit
 * in one atomic step.
 */
async function executeConfirmed(repo: OperationsRepository, stored: StoredReport, by: Confirmer, from: ReportStatus): Promise<void> {
  const id = stored.report.id;
  const agentId = stored.report.agentId;
  const payload = stored.extraction?.payload;
  const action = payload?.requestedAction.value;
  const orderId = stored.validation?.resolvedOrderId;
  if (!payload || !action || !orderId) throw new ReportError("INVALID_STATE", "Report has no verified action.");

  transition(stored, "CONFIRMED");
  const confirmedAt = now();
  await repo.saveReport(stored);
  await repo.appendAudit({ actorId: by.actorId, actorRole: by.actorRole, entity: "REPORT", entityId: id, reportId: id, event: "ACTION_CONFIRMED", before: { status: from }, after: { status: "CONFIRMED", action, via: by.via }, createdAt: confirmedAt });

  const fail = async (reason: string) => {
    transition(stored, "FAILED");
    stored.report.failureReason = reason;
    await repo.saveReport(stored);
    await repo.appendAudit({ actorId: "system", actorRole: "SYSTEM", entity: "REPORT", entityId: id, reportId: id, event: "PIPELINE_FAILED", before: null, after: { reason }, createdAt: now() });
  };

  const order = await repo.getOrder(orderId);
  if (!order || order.assignedAgentId !== agentId || !isActionAllowed(action, order.status)) {
    return fail(`Order ${orderId} changed before confirmation; nothing was updated.`);
  }

  const t0 = performance.now();
  const executedAt = now();
  const applied = applyAction(order, action, payload, executedAt);
  const actionId = `${id}-A`;
  const timings = [...stored.report.timings, { stage: "execution" as const, latencyMs: Math.round(performance.now() - t0) }];
  try {
    // One atomic step: order update guarded by its last-seen version, action record, EXECUTED, audit.
    await repo.commitConfirmedAction({
      reportId: id,
      timings,
      executedAt,
      expectedOrderUpdatedAt: order.updatedAt,
      order: applied.order,
      action: { id: actionId, reportId: id, orderId, type: action, payload: applied.actionPayload, status: "EXECUTED", confirmedBy: by.actorId, confirmedAt, executedAt },
      audit: [
        { actorId: "system", actorRole: "SYSTEM", entity: "ACTION", entityId: actionId, reportId: id, event: "ACTION_EXECUTED", before: null, after: { type: action, ...applied.actionPayload }, createdAt: executedAt },
        { actorId: "system", actorRole: "SYSTEM", entity: "ORDER", entityId: orderId, reportId: id, event: "ORDER_UPDATED", before: { status: order.status, instructions: order.instructions, slotStart: order.slotStart, slotEnd: order.slotEnd }, after: { status: applied.order.status, instructions: applied.order.instructions, slotStart: applied.order.slotStart, slotEnd: applied.order.slotEnd }, createdAt: executedAt },
      ],
    });
  } catch (err) {
    if (err instanceof OrderChangedError) return fail(`Order ${orderId} changed before confirmation; nothing was updated.`);
    throw err;
  }
}

/** The agent confirms a verified report. Requires AWAITING_CONFIRMATION. */
export async function confirmReport(id: string, agentId: string, via: DecisionChannel = { channel: "tap" }): Promise<ReportDetail> {
  const repo = getRepository();
  const stored = await loadOwned(repo, id, agentId);
  if (stored.report.status !== "AWAITING_CONFIRMATION")
    throw new ReportError("INVALID_STATE", `Only reports awaiting confirmation can be confirmed (this one is ${stored.report.status}).`);
  await executeConfirmed(repo, stored, { actorId: agentId, actorRole: "AGENT", via }, "AWAITING_CONFIRMATION");
  return agentView(await repo.getReport(id), agentId);
}

/**
 * The agent cannot resolve a report (e.g. the order number is not in the system) and hands it to dispatch.
 * Nothing changes on any order; the report, transcript and recording are kept for a dispatcher to resolve.
 */
export async function escalateReport(id: string, agentId: string, note: string | null): Promise<ReportDetail> {
  const repo = getRepository();
  const stored = await loadOwned(repo, id, agentId);
  if (stored.report.status !== "NEEDS_CLARIFICATION")
    throw new ReportError("INVALID_STATE", `Only reports that need clarification can be sent to dispatch (this one is ${stored.report.status}).`);
  transition(stored, "ESCALATED");
  if (stored.priority === "LOW" || stored.priority === "MEDIUM") stored.priority = "HIGH";
  await repo.saveReport(stored);
  await repo.appendAudit({ actorId: agentId, actorRole: "AGENT", entity: "REPORT", entityId: id, reportId: id, event: "REPORT_ESCALATED", before: { status: "NEEDS_CLARIFICATION", question: stored.validation?.clarificationQuestion ?? null }, after: { status: "ESCALATED", note }, createdAt: now() });
  return agentView(await repo.getReport(id), agentId);
}

async function loadEscalated(repo: OperationsRepository, id: string): Promise<StoredReport> {
  const stored = await repo.getStoredReport(id);
  if (!stored) throw new ReportError("NOT_FOUND", `Report ${id} not found.`);
  if (stored.report.status !== "ESCALATED")
    throw new ReportError("INVALID_STATE", `Only reports sent to dispatch can be resolved (this one is ${stored.report.status}).`);
  return stored;
}

/**
 * A dispatcher resolves an escalated report by naming the order and the action. The choice goes through
 * the same verification as an agent's (order exists, on the reporting agent's route, action allowed for its
 * status, required fields present); only a VERIFIED choice is executed, confirmed by the dispatcher.
 * Otherwise nothing changes and the report stays with dispatch.
 */
export async function resolveEscalation(
  id: string,
  dispatcherId: string,
  input: { orderId: string; requestedAction: ActionType; notes?: string | null },
): Promise<ReportDetail> {
  const repo = getRepository();
  const stored = await loadEscalated(repo, id);
  if (!stored.extraction || !stored.transcript)
    throw new ReportError("INVALID_STATE", "This report has no readable transcript to act on. Close it with a note and contact the agent.");

  const payload = structuredClone(stored.extraction.payload);
  payload.orderReference = { value: input.orderId, evidence: null, confidence: null };
  payload.requestedAction = { value: input.requestedAction, evidence: null, confidence: null };
  const provided: Array<"orderReference" | "requestedAction" | "notes"> = ["orderReference", "requestedAction"];
  const notes = input.notes?.trim() || null;
  if (notes) {
    payload.notes = { value: notes, evidence: null, confidence: null };
    provided.push("notes");
  }

  const v = validateExtraction({
    raw: payload,
    transcript: stored.transcript.text,
    transcriptConfidence: stored.transcript.confidence,
    agentId: stored.report.agentId,
    referenceTime: now(),
    orders: await repo.listOrders(),
    agentProvided: provided,
    language: "en",
  });
  if (v.outcome !== "VERIFIED" || !v.resolvedOrder || !v.payload) {
    const failed = v.checks.filter((c) => c.status === "FAIL").map((c) => c.detail);
    throw new ReportError("INVALID_STATE", `Not applied: ${failed.join(" ") || v.prompt} The report stays with dispatch.`);
  }

  stored.validation = { reportId: id, outcome: "VERIFIED", checks: v.checks, resolvedOrderId: v.resolvedOrder.id, clarificationQuestion: null };
  stored.extraction = { ...stored.extraction, payload: v.payload };
  stored.confirmationPrompt = null;
  await repo.appendAudit({ actorId: dispatcherId, actorRole: "DISPATCHER", entity: "REPORT", entityId: id, reportId: id, event: "ESCALATION_RESOLVED", before: { status: "ESCALATED" }, after: { orderId: v.resolvedOrder.id, action: input.requestedAction, notes }, createdAt: now() });
  await executeConfirmed(repo, stored, { actorId: dispatcherId, actorRole: "DISPATCHER", via: { channel: "dispatcher", note: notes } }, "ESCALATED");
  return requireReport(await repo.getReport(id));
}

/** A dispatcher closes an escalated report without any order change, recording why. */
export async function closeEscalation(id: string, dispatcherId: string, note: string): Promise<ReportDetail> {
  const repo = getRepository();
  const stored = await loadEscalated(repo, id);
  transition(stored, "REJECTED");
  await repo.saveReport(stored);
  await repo.appendAudit({ actorId: dispatcherId, actorRole: "DISPATCHER", entity: "REPORT", entityId: id, reportId: id, event: "ESCALATION_CLOSED", before: { status: "ESCALATED" }, after: { status: "REJECTED", note }, createdAt: now() });
  return requireReport(await repo.getReport(id));
}

function requireReport(detail: ReportDetail | null): ReportDetail {
  if (!detail) throw new ReportError("NOT_FOUND", "Report not found.");
  return detail;
}

export async function rejectReport(id: string, agentId: string, via: DecisionChannel = { channel: "tap" }): Promise<ReportDetail> {
  const repo = getRepository();
  const stored = await loadOwned(repo, id, agentId);
  const from = stored.report.status;
  if (from !== "AWAITING_CONFIRMATION" && from !== "NEEDS_CLARIFICATION")
    throw new ReportError("INVALID_STATE", `Cannot reject a report that is ${from}.`);
  transition(stored, "REJECTED");
  await repo.appendAudit({ actorId: agentId, actorRole: "AGENT", entity: "REPORT", entityId: id, reportId: id, event: "REPORT_REJECTED", before: { status: from }, after: { status: "REJECTED", via }, createdAt: now() });
  await repo.saveReport(stored);
  return agentView(await repo.getReport(id), agentId);
}

export interface SpokenReplyResult {
  decision: SpokenDecision;
  heard: string;
  report: ReportDetail;
}

/**
 * The agent answers the confirmation prompt by voice. The reply is transcribed by the real speech-to-text
 * provider and classified by a strict deterministic yes/no lexicon. Only a clear "yes" confirms and only a
 * clear "no" rejects; anything else changes nothing (logged for traceability) and the agent uses the buttons.
 */
export async function answerByVoice(id: string, agentId: string, audio: AudioInput, language: LanguageCode): Promise<SpokenReplyResult> {
  const repo = getRepository();
  const stored = await loadOwned(repo, id, agentId);
  if (stored.report.status !== "AWAITING_CONFIRMATION")
    throw new ReportError("INVALID_STATE", `Only reports awaiting confirmation can be answered (this one is ${stored.report.status}).`);
  const stt = getSttProvider();
  if (stt.id === "mock-stt") throw new ReportError("INVALID_STATE", "Speech-to-text is simulated, so spoken replies are unavailable. Use the buttons.");

  let heard: string;
  let model: string | null;
  try {
    const t = await stt.transcribe(audio, { language });
    heard = t.text.trim();
    model = t.provenance.model ?? null;
  } catch (err) {
    if (err instanceof ProviderError) throw new ReportError("UPSTREAM_ERROR", "Could not hear the reply. Please use the buttons.");
    throw err;
  }

  const decision = classifySpokenReply(heard);
  const via: DecisionChannel = { channel: "voice", heard, sttProvider: stt.id, sttModel: model };
  if (decision === "yes") return { decision, heard, report: await confirmReport(id, agentId, via) };
  if (decision === "no") return { decision, heard, report: await rejectReport(id, agentId, via) };

  await repo.appendAudit({ actorId: agentId, actorRole: "AGENT", entity: "REPORT", entityId: id, reportId: id, event: "SPOKEN_REPLY_UNCLEAR", before: null, after: via, createdAt: now() });
  return { decision, heard, report: agentView(await repo.getReport(id), agentId) };
}
