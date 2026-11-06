import type { ReportStatus } from "./reports";

/**
 * Allowed report state transitions. This is the structural guarantee behind
 * "never execute an operational action without confirmation": EXECUTED is reachable only from CONFIRMED,
 * and CONFIRMED only from AWAITING_CONFIRMATION.
 */
export const REPORT_TRANSITIONS: Readonly<Record<ReportStatus, readonly ReportStatus[]>> = {
  RECORDED: ["TRANSCRIBED", "FAILED"],
  TRANSCRIBED: ["EXTRACTED", "FAILED"],
  EXTRACTED: ["VALIDATED", "NEEDS_CLARIFICATION", "REJECTED", "FAILED"],
  VALIDATED: ["AWAITING_CONFIRMATION", "FAILED"],
  NEEDS_CLARIFICATION: ["EXTRACTED", "EDITED", "REJECTED", "FAILED"],
  AWAITING_CONFIRMATION: ["CONFIRMED", "EDITED", "REJECTED"],
  EDITED: ["VALIDATED", "NEEDS_CLARIFICATION", "REJECTED"],
  CONFIRMED: ["EXECUTED", "FAILED"],
  EXECUTED: [],
  REJECTED: [],
  FAILED: [],
};

export const TERMINAL_STATUSES: readonly ReportStatus[] = ["EXECUTED", "REJECTED", "FAILED"];

export function canTransition(from: ReportStatus, to: ReportStatus): boolean {
  return REPORT_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: ReportStatus,
    readonly to: ReportStatus,
  ) {
    super(`Invalid report transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: ReportStatus, to: ReportStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
