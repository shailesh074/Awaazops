import { z } from "zod";
import { languageCodeSchema } from "./language";
import { provenanceSchema } from "./provenance";
import { actionTypeSchema } from "./extraction";

/** Lifecycle of a single voice report. Transitions are enforced in `report-lifecycle.ts`. */
export const REPORT_STATUSES = [
  "RECORDED",
  "TRANSCRIBED",
  "EXTRACTED",
  "VALIDATED",
  "NEEDS_CLARIFICATION",
  "AWAITING_CONFIRMATION",
  /** The agent could not resolve it and handed it to dispatch; a dispatcher links the order or closes it. */
  "ESCALATED",
  "EDITED",
  "CONFIRMED",
  "EXECUTED",
  "REJECTED",
  "FAILED",
] as const;
export const reportStatusSchema = z.enum(REPORT_STATUSES);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const PIPELINE_STAGES = ["stt", "reasoning", "validation", "tts", "execution"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const stageTimingSchema = z.object({
  stage: z.enum(PIPELINE_STAGES),
  latencyMs: z.number().nonnegative(),
});
export type StageTiming = z.infer<typeof stageTimingSchema>;

export const transcriptSegmentSchema = z.object({
  text: z.string(),
  startMs: z.number().nonnegative().nullable(),
  endMs: z.number().nonnegative().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

export const transcriptSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  text: z.string(),
  language: languageCodeSchema,
  /** Overall confidence when the provider reports one; null otherwise (never fabricated). */
  confidence: z.number().min(0).max(1).nullable(),
  segments: z.array(transcriptSegmentSchema),
  provenance: provenanceSchema,
});
export type Transcript = z.infer<typeof transcriptSchema>;

export const voiceReportSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  language: languageCodeSchema,
  status: reportStatusSchema,
  audioPath: z.string().nullable(),
  audioDurationMs: z.number().nonnegative().nullable(),
  failureReason: z.string().nullable(),
  timings: z.array(stageTimingSchema),
  /** "measured" when produced by the running pipeline; "illustrative" for seeded demo records. */
  timingSource: z.enum(["measured", "illustrative"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type VoiceReport = z.infer<typeof voiceReportSchema>;

export const OPERATIONAL_ACTION_STATUSES = ["PENDING", "EXECUTED", "FAILED"] as const;

/** An action exists only after explicit confirmation by the agent. */
export const operationalActionSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  orderId: z.string(),
  type: actionTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(OPERATIONAL_ACTION_STATUSES),
  confirmedBy: z.string(),
  confirmedAt: z.iso.datetime(),
  executedAt: z.iso.datetime().nullable(),
});
export type OperationalAction = z.infer<typeof operationalActionSchema>;

export const auditEventSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  actorRole: z.enum(["AGENT", "DISPATCHER", "SYSTEM"]),
  entity: z.enum(["REPORT", "ORDER", "ACTION"]),
  entityId: z.string(),
  /** The voice report this event traces back to, so every change links to its evidence. */
  reportId: z.string().nullable(),
  event: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  createdAt: z.iso.datetime(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
