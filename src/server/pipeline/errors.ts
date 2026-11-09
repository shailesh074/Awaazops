import "server-only";

export type ReportErrorCode = "NOT_FOUND" | "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_STATE" | "BAD_REQUEST" | "UPSTREAM_ERROR";

const HTTP: Record<ReportErrorCode, number> = { NOT_FOUND: 404, UNAUTHENTICATED: 401, FORBIDDEN: 403, INVALID_STATE: 409, BAD_REQUEST: 400, UPSTREAM_ERROR: 502 };

export class ReportError extends Error {
  constructor(
    readonly code: ReportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReportError";
  }
  get status() {
    return HTTP[this.code];
  }
}
