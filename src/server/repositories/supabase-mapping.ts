import type { Agent, AuditEvent, LabResult, OperationalAction, Order, Provenance, ReportDetail, StoredLabSample, Transcript, VoiceReport } from "@/domain";
import type { StoredReport } from "./types";

/** Row shapes as returned by PostgREST (snake_case). Pure mapping, no I/O — unit-tested. */

export interface AgentRow { id: string; name: string; phone_masked: string; hub: string; preferred_language: string }
export interface OrderRow {
  id: string; customer_name: string; customer_phone_masked: string; address_line: string; locality: string; city: string;
  pincode: string; status: Order["status"]; priority: Order["priority"]; assigned_agent_id: string | null;
  slot_start: string; slot_end: string; instructions: string | null; updated_at: string;
}
export interface ActionRow {
  id: string; report_id: string; order_id: string; type: OperationalAction["type"]; payload: Record<string, unknown>;
  status: OperationalAction["status"]; confirmed_by: string; confirmed_at: string; executed_at: string | null;
}
export interface ReportRow {
  id: string; agent_id: string; language: VoiceReport["language"]; status: VoiceReport["status"]; audio_path: string | null;
  audio_duration_ms: number | null; failure_reason: string | null; timings: VoiceReport["timings"];
  timing_source: VoiceReport["timingSource"]; priority: ReportDetail["priority"]; confirmation_prompt: string | null;
  created_at: string; updated_at: string;
  transcripts?: unknown; extractions?: unknown; validations?: unknown; operational_actions?: unknown; prompt_audio?: unknown;
}
export interface AuditRow {
  id: string; actor_id: string; actor_role: AuditEvent["actorRole"]; entity: AuditEvent["entity"]; entity_id: string;
  report_id: string | null; event: string; before: unknown; after: unknown; created_at: string;
}

/** Embedded one-to-one relations may arrive as an object or a one-element array, depending on detection. */
export function one<T>(x: unknown): T | null {
  if (Array.isArray(x)) return (x[0] as T) ?? null;
  return (x as T) ?? null;
}

/** Postgres timestamps come back as "2026-11-06T08:30:00+00:00"; the domain uses canonical ISO ("…Z"). */
export const iso = (t: string): string => new Date(t).toISOString();
const isoOrNull = (t: string | null) => (t ? iso(t) : null);

export const agentFromRow = (r: AgentRow): Agent => ({
  id: r.id, name: r.name, phoneMasked: r.phone_masked, hub: r.hub, preferredLanguage: r.preferred_language,
});

export const orderFromRow = (r: OrderRow): Order => ({
  id: r.id, customerName: r.customer_name, customerPhoneMasked: r.customer_phone_masked, addressLine: r.address_line,
  locality: r.locality, city: r.city, pincode: r.pincode, status: r.status, priority: r.priority,
  assignedAgentId: r.assigned_agent_id, slotStart: iso(r.slot_start), slotEnd: iso(r.slot_end),
  instructions: r.instructions, updatedAt: iso(r.updated_at),
});

export const actionFromRow = (r: ActionRow): OperationalAction => ({
  id: r.id, reportId: r.report_id, orderId: r.order_id, type: r.type, payload: r.payload ?? {}, status: r.status,
  confirmedBy: r.confirmed_by, confirmedAt: iso(r.confirmed_at), executedAt: isoOrNull(r.executed_at),
});

export const auditFromRow = (r: AuditRow): AuditEvent => ({
  id: r.id, actorId: r.actor_id, actorRole: r.actor_role, entity: r.entity, entityId: r.entity_id, reportId: r.report_id,
  event: r.event, before: r.before ?? null, after: r.after ?? null, createdAt: iso(r.created_at),
});

interface TranscriptRow { id: string; text: string; language: VoiceReport["language"]; confidence: number | null; segments: unknown; provenance: unknown }
interface ExtractionRow { id: string; payload: unknown; provenance: unknown }
interface ValidationRow { outcome: string; checks: unknown; resolved_order_id: string | null; clarification_question: string | null }
interface PromptAudioRow { text: string; provenance: unknown }

export function storedReportFromRow(r: ReportRow): StoredReport {
  const t = one<TranscriptRow>(r.transcripts);
  const x = one<ExtractionRow>(r.extractions);
  const v = one<ValidationRow>(r.validations);
  const a = one<ActionRow>(r.operational_actions);
  return {
    report: {
      id: r.id, agentId: r.agent_id, language: r.language, status: r.status, audioPath: r.audio_path,
      audioDurationMs: r.audio_duration_ms, failureReason: r.failure_reason, timings: r.timings ?? [],
      timingSource: r.timing_source, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
    },
    transcript: t
      ? { id: t.id, reportId: r.id, text: t.text, language: t.language, confidence: t.confidence, segments: (t.segments ?? []) as Transcript["segments"], provenance: t.provenance as Provenance }
      : null,
    extraction: x ? { id: x.id, reportId: r.id, payload: x.payload as never, provenance: x.provenance as never } : null,
    validation: v
      ? { reportId: r.id, outcome: v.outcome as never, checks: v.checks as never, resolvedOrderId: v.resolved_order_id, clarificationQuestion: v.clarification_question }
      : null,
    actionId: a?.id ?? null,
    priority: r.priority,
    confirmationPrompt: r.confirmation_prompt,
  };
}

/** Joins a report row with its agent and (resolved) order into the UI view. */
export function reportDetailFromRow(r: ReportRow, agents: Map<string, Agent>, orders: Map<string, Order>): ReportDetail | null {
  // `actionId` is a storage detail; the view carries the joined action instead.
  const { actionId: _actionId, ...stored } = storedReportFromRow(r);
  const agent = agents.get(stored.report.agentId);
  if (!agent) return null; // not visible to this viewer
  const orderId = stored.validation?.resolvedOrderId ?? null;
  const a = one<ActionRow>(r.operational_actions);
  const pa = one<PromptAudioRow>(r.prompt_audio);
  return {
    ...stored,
    agent,
    order: orderId ? (orders.get(orderId) ?? null) : null,
    action: a ? actionFromRow(a) : null,
    promptAudio: pa && pa.text === stored.confirmationPrompt ? { provenance: pa.provenance as never } : null,
  };
}

// ── Lab ───────────────────────────────────────────────────────────────────────────────────────────

export interface LabSampleRow {
  id: string; title: string; language: StoredLabSample["language"]; accent: string; noise: StoredLabSample["noise"];
  duration_ms: number; audio_path: string; mime_type: string; reference_transcript: string | null;
  expected_order: string | null; expected_issue: StoredLabSample["expected"]["issue"];
  expected_action: StoredLabSample["expected"]["requestedAction"]; expects_clarification: boolean;
  created_by: string; created_at: string;
}

export const labSampleFromRow = (r: LabSampleRow): StoredLabSample => ({
  id: r.id, title: r.title, language: r.language, accent: r.accent, noise: r.noise, durationMs: r.duration_ms,
  referenceTranscript: r.reference_transcript, audioPath: r.audio_path, mimeType: r.mime_type,
  createdBy: r.created_by, createdAt: iso(r.created_at),
  expected: { orderReference: r.expected_order, issue: r.expected_issue, requestedAction: r.expected_action, expectsClarification: r.expects_clarification },
});

export const labSampleToRow = (s: StoredLabSample): LabSampleRow => ({
  id: s.id, title: s.title, language: s.language, accent: s.accent, noise: s.noise, duration_ms: Math.round(s.durationMs),
  audio_path: s.audioPath, mime_type: s.mimeType, reference_transcript: s.referenceTranscript,
  expected_order: s.expected.orderReference, expected_issue: s.expected.issue, expected_action: s.expected.requestedAction,
  expects_clarification: s.expected.expectsClarification, created_by: s.createdBy, created_at: s.createdAt,
});

export interface LabResultRow {
  run_id: string; sample_id: string; transcript: string; payload: unknown; validation_outcome: LabResult["validationOutcome"];
  stage_latency: LabResult["stageLatencyMs"]; provenance: LabResult["provenance"]; error: string | null;
}

export const labResultFromRow = (r: LabResultRow): LabResult => ({
  sampleId: r.sample_id, transcript: r.transcript, payload: (r.payload ?? null) as LabResult["payload"],
  validationOutcome: r.validation_outcome, stageLatencyMs: r.stage_latency ?? {}, provenance: r.provenance ?? {},
  error: r.error, simulated: Boolean(r.provenance?.stt?.simulated),
});

/** Columns selected for report reads (embedded one-to-one artefacts). */
export const REPORT_SELECT =
  "*, transcripts(*), extractions(*), validations(*), operational_actions(*), prompt_audio(text, provenance)";
