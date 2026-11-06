import { z } from "zod";

export const VALIDATION_CHECKS = [
  "SCHEMA_VALID",
  "EVIDENCE_GROUNDED",
  "ORDER_EXISTS",
  "ORDER_ASSIGNED_TO_AGENT",
  "ACTION_ALLOWED_FOR_STATUS",
  "REQUIRED_FIELDS_PRESENT",
  "TIME_CONSTRAINT_VALID",
  "TRANSCRIPT_CONFIDENCE",
] as const;
export const validationCheckIdSchema = z.enum(VALIDATION_CHECKS);
export type ValidationCheckId = z.infer<typeof validationCheckIdSchema>;

export const validationCheckSchema = z.object({
  id: validationCheckIdSchema,
  status: z.enum(["PASS", "WARN", "FAIL", "SKIPPED"]),
  detail: z.string(),
});
export type ValidationCheck = z.infer<typeof validationCheckSchema>;

export const VALIDATION_OUTCOMES = ["VERIFIED", "NEEDS_CLARIFICATION", "REJECTED"] as const;
export const validationOutcomeSchema = z.enum(VALIDATION_OUTCOMES);
export type ValidationOutcome = z.infer<typeof validationOutcomeSchema>;

export const validationResultSchema = z.object({
  reportId: z.string(),
  outcome: validationOutcomeSchema,
  checks: z.array(validationCheckSchema),
  /** Canonical order ID once verified against the database. */
  resolvedOrderId: z.string().nullable(),
  /** Question to put to the agent when outcome is NEEDS_CLARIFICATION. */
  clarificationQuestion: z.string().nullable(),
});
export type ValidationResult = z.infer<typeof validationResultSchema>;
