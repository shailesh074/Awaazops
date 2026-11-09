import "server-only";
import { reasoningOutputSchema } from "@/server/reliability/reasoning-schema";
import { ProviderError } from "../errors";
import type { ReasoningInput, ReasoningProvider, ReasoningResult } from "./types";

/**
 * Optional-LLM wrapper: tries the primary (an LLM) and falls back to the deterministic engine when the
 * primary is not configured, throws (network, auth, refusal, rate limit), exceeds the timeout, or returns
 * output that does not match the reasoning schema. A fallback is never silent: the result's provenance
 * records `fallbackFrom` and `fallbackReason`, the audit trail records them, and the UI shows them.
 */
export class FallbackReasoningProvider implements ReasoningProvider {
  readonly id: ReasoningProvider["id"];

  constructor(
    private readonly primary: ReasoningProvider,
    private readonly fallback: ReasoningProvider,
    private readonly timeoutMs: number,
  ) {
    this.id = primary.id;
  }

  /** Always usable: the fallback needs no configuration. */
  isConfigured(): boolean {
    return true;
  }

  /** Whether the primary (LLM) itself is configured — for status reporting. */
  primaryConfigured(): boolean {
    return this.primary.isConfigured();
  }

  async extract(input: ReasoningInput): Promise<ReasoningResult> {
    if (!this.primary.isConfigured()) return this.useFallback(input, "not configured");

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ProviderError(this.primary.id, "TIMEOUT", `no response within ${this.timeoutMs} ms`));
      }, this.timeoutMs);
    });

    try {
      const result = await Promise.race([this.primary.extract({ ...input, signal: controller.signal }), timeout]);
      const check = reasoningOutputSchema.safeParse(result.raw);
      if (!check.success) {
        const issue = check.error.issues[0];
        return this.useFallback(input, `invalid output (${issue?.path.join(".") || "root"}: ${issue?.message ?? "schema mismatch"})`);
      }
      return result;
    } catch (err) {
      return this.useFallback(input, describe(err));
    } finally {
      clearTimeout(timer);
    }
  }

  private async useFallback(input: ReasoningInput, reason: string): Promise<ReasoningResult> {
    console.warn(`[reasoning] ${this.primary.id} unavailable (${reason}); using ${this.fallback.id}`);
    const result = await this.fallback.extract(input);
    return { ...result, provenance: { ...result.provenance, fallbackFrom: this.primary.id, fallbackReason: reason } };
  }
}

function describe(err: unknown): string {
  if (err instanceof ProviderError) {
    const what = { TIMEOUT: "timed out", NOT_CONFIGURED: "not configured", INVALID_RESPONSE: "invalid or refused response", UPSTREAM_ERROR: "service error", NOT_IMPLEMENTED: "not implemented", UNSUPPORTED_INPUT: "unsupported input" }[err.code];
    return `${what}: ${err.message.replace(/^\[[^\]]+\]\s*/, "")}`;
  }
  return err instanceof Error ? `error: ${err.message}` : "error";
}
