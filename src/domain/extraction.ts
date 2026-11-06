import { z } from "zod";
import { provenanceSchema } from "./provenance";

export const ISSUE_TYPES = [
  "CUSTOMER_UNAVAILABLE",
  "WRONG_ADDRESS",
  "RESCHEDULE_REQUEST",
  "UNCLEAR_INSTRUCTIONS",
  "PACKAGE_UNDELIVERABLE",
  "OTHER",
] as const;
export const issueTypeSchema = z.enum(ISSUE_TYPES);
export type IssueType = z.infer<typeof issueTypeSchema>;

export const ACTION_TYPES = [
  "RESCHEDULE",
  "MARK_CUSTOMER_UNAVAILABLE",
  "FLAG_ADDRESS_ISSUE",
  "UPDATE_INSTRUCTIONS",
  "MARK_DELIVERY_FAILED",
  "ESCALATE_TO_DISPATCHER",
] as const;
export const actionTypeSchema = z.enum(ACTION_TYPES);
export type ActionType = z.infer<typeof actionTypeSchema>;

/**
 * A pointer back into the transcript proving where a value came from.
 * Offsets are character offsets into the transcript text; the Reliability Engine
 * re-checks that `quote === transcript.slice(start, end)` rather than trusting the LLM.
 */
export const evidenceSpanSchema = z.object({
  quote: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
export type EvidenceSpan = z.infer<typeof evidenceSpanSchema>;

/** One extracted value with its evidence and the model's self-reported confidence (0–1). */
export const extractedField = <T extends z.ZodType>(value: T) =>
  z.object({
    value: value.nullable(),
    evidence: evidenceSpanSchema.nullable(),
    confidence: z.number().min(0).max(1),
  });

export const timeConstraintSchema = z.object({
  kind: z.enum(["AFTER", "BEFORE", "BETWEEN", "AT", "DATE_ONLY"]),
  /** ISO-8601 in Asia/Kolkata offset, resolved by the normaliser — not by the LLM. */
  start: z.iso.datetime({ offset: true }).nullable(),
  end: z.iso.datetime({ offset: true }).nullable(),
  /** The phrase as spoken, e.g. "shaam 6 baje ke baad". */
  spoken: z.string(),
});
export type TimeConstraint = z.infer<typeof timeConstraintSchema>;

/**
 * The structured payload the reasoning step must produce. Raw LLM output is parsed against this
 * schema; anything that fails is rejected, never coerced silently.
 */
export const extractionPayloadSchema = z.object({
  orderReference: extractedField(z.string()),
  issue: extractedField(issueTypeSchema),
  requestedAction: extractedField(actionTypeSchema),
  timeConstraint: extractedField(timeConstraintSchema),
  notes: extractedField(z.string()),
  /** Things the model itself flagged as unclear or missing. */
  ambiguities: z.array(z.string()),
});
export type ExtractionPayload = z.infer<typeof extractionPayloadSchema>;

export const extractionSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  payload: extractionPayloadSchema,
  provenance: provenanceSchema,
});
export type Extraction = z.infer<typeof extractionSchema>;
