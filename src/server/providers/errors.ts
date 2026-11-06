import "server-only";

export type ProviderErrorCode =
  | "NOT_CONFIGURED"
  | "NOT_IMPLEMENTED"
  | "UPSTREAM_ERROR"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "UNSUPPORTED_INPUT";

/** Typed error for every provider failure. Callers surface these; they never fall back to mocks silently. */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly code: ProviderErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`[${provider}] ${message}`, options);
    this.name = "ProviderError";
  }
}

export const PENDING_VERIFICATION =
  "Integration pending verification against the official Gnani documentation. " +
  "No endpoint or request format has been assumed.";
