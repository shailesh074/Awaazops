import "server-only";
import { ProviderError, type ProviderErrorCode } from "./errors";

/**
 * Plumbing shared by the Gnani (Vachana) adapters. Per docs.gnani.ai, one API key covers STT and TTS and
 * a key may have only one active request at a time (429 RATE_LIMITED otherwise), so every Gnani call
 * from this process goes through one queue, with a single short retry on 429.
 */

let queue: Promise<unknown> = Promise.resolve();

export function gnaniSerialised<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

const RATE_LIMIT_RETRY_MS = 600;

/** Sends a request through the shared queue; retries once on 429; maps network failures to ProviderError. */
export async function gnaniFetch(provider: string, send: () => Promise<Response>): Promise<Response> {
  return gnaniSerialised(async () => {
    try {
      let res = await send();
      if (res.status === 429) {
        await new Promise((ok) => setTimeout(ok, RATE_LIMIT_RETRY_MS));
        res = await send();
      }
      return res;
    } catch (err) {
      const timeout = err instanceof DOMException && err.name === "TimeoutError";
      throw new ProviderError(
        provider,
        timeout ? "TIMEOUT" : "UPSTREAM_ERROR",
        timeout ? "The Gnani service timed out." : "Could not reach the Gnani service.",
        { cause: err },
      );
    }
  });
}

/**
 * Human-readable summary of every documented Gnani error shape:
 *  - `{ success: false, error: { type, message } }`          (STT envelope; TTS 503)
 *  - `{ success: false, message, status_code }`               (TTS 400/500)
 *  - `{ detail: { error_code, message, status_code } }`        (auth / rate limit)
 *  - `{ detail: [{ msg, loc }] }`                              (validation 422)
 *  - `{ error: "Gateway Timeout", code, message }`             (STT 504)
 */
export function describeGnaniError(status: number, body: unknown): string {
  const b = body as {
    error?: { type?: string; message?: string } | string;
    detail?: { error_code?: string; message?: string } | Array<{ msg?: string }>;
    message?: string;
    code?: string;
  } | null;
  if (b?.error && typeof b.error === "object") return `${b.error.type ?? "ERROR"}: ${b.error.message ?? ""}`.trim();
  if (b?.detail && !Array.isArray(b.detail)) return `${b.detail.error_code ?? "ERROR"}: ${b.detail.message ?? ""}`.trim();
  if (Array.isArray(b?.detail)) return `Validation error: ${b.detail.map((d) => d.msg).join("; ")}`;
  if (typeof b?.error === "string") return `${b.code ?? b.error}${b.message ? `: ${b.message}` : ""}`;
  if (typeof b?.message === "string") return b.message;
  return `HTTP ${status}`;
}

export function gnaniErrorCode(status: number): ProviderErrorCode {
  if (status === 401 || status === 402 || status === 403) return "NOT_CONFIGURED";
  if (status === 400 || status === 422) return "UNSUPPORTED_INPUT";
  if (status === 504) return "TIMEOUT";
  return "UPSTREAM_ERROR";
}
