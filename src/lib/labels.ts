import type {
  ActionType,
  IssueType,
  LanguageCode,
  OrderStatus,
  Priority,
  ReportStatus,
  ValidationCheckId,
  ValidationOutcome,
} from "@/domain";

export const ISSUE_LABELS: Record<IssueType, string> = {
  CUSTOMER_UNAVAILABLE: "Customer unavailable",
  WRONG_ADDRESS: "Wrong address",
  RESCHEDULE_REQUEST: "Reschedule request",
  UNCLEAR_INSTRUCTIONS: "Unclear instructions",
  PACKAGE_UNDELIVERABLE: "Package undeliverable",
  OTHER: "Other",
};

export const ACTION_LABELS: Record<ActionType, string> = {
  RESCHEDULE: "Reschedule delivery",
  MARK_CUSTOMER_UNAVAILABLE: "Mark customer unavailable",
  FLAG_ADDRESS_ISSUE: "Flag address issue",
  UPDATE_INSTRUCTIONS: "Update instructions",
  MARK_DELIVERY_FAILED: "Mark delivery failed",
  ESCALATE_TO_DISPATCHER: "Escalate to dispatcher",
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  RECORDED: "Recorded",
  TRANSCRIBED: "Transcribed",
  EXTRACTED: "Extracted",
  VALIDATED: "Validated",
  NEEDS_CLARIFICATION: "Needs clarification",
  AWAITING_CONFIRMATION: "Awaiting confirmation",
  ESCALATED: "Sent to dispatch",
  EDITED: "Edited",
  CONFIRMED: "Confirmed",
  EXECUTED: "Executed",
  REJECTED: "Rejected",
  FAILED: "Failed",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  OUT_FOR_DELIVERY: "Out for delivery",
  ATTEMPTED: "Attempted",
  RESCHEDULED: "Rescheduled",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  ON_HOLD: "On hold",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const PRIORITY_RANK: Record<Priority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export const CHECK_LABELS: Record<ValidationCheckId, string> = {
  SCHEMA_VALID: "Output matches schema",
  EVIDENCE_GROUNDED: "Every value grounded in transcript",
  ORDER_EXISTS: "Order exists",
  ORDER_ASSIGNED_TO_AGENT: "Order assigned to this agent",
  ACTION_ALLOWED_FOR_STATUS: "Action allowed for order status",
  REQUIRED_FIELDS_PRESENT: "Required fields present",
  TIME_CONSTRAINT_VALID: "Requested time is valid",
  TRANSCRIPT_CONFIDENCE: "Transcript confidence",
};

export const OUTCOME_LABELS: Record<ValidationOutcome, string> = {
  VERIFIED: "Verified",
  NEEDS_CLARIFICATION: "Needs clarification",
  REJECTED: "Rejected",
};

export const LANGUAGE_LABELS_SHORT: Record<LanguageCode, string> = {
  hi: "Hindi",
  en: "English",
  "hi-en": "Hinglish",
};

/** Field keys of ExtractionPayload that carry evidence, with display names. */
export const FIELD_LABELS = {
  orderReference: "Order",
  issue: "Issue",
  requestedAction: "Requested action",
  timeConstraint: "Time",
  notes: "Notes",
} as const;
export type EvidenceFieldKey = keyof typeof FIELD_LABELS;
