import "server-only";
import type { ReasoningInput, ReasoningProvider, ReasoningResult } from "../types";
import { extractWithRules } from "./engine";

/**
 * Deterministic rules engine as a first-class reasoning provider. Not AI and not simulated: the same
 * transcript always yields the same output, and no confidence is invented. Always available, no paid API.
 */
export class RulesReasoningProvider implements ReasoningProvider {
  readonly id = "rules" as const;

  isConfigured(): boolean {
    return true;
  }

  async extract({ transcript }: ReasoningInput): Promise<ReasoningResult> {
    const started = performance.now();
    const raw = extractWithRules(transcript);
    return {
      raw,
      provenance: {
        provider: this.id,
        simulated: false,
        model: "awaazops-rules-v2",
        latencyMs: Math.round(performance.now() - started),
        createdAt: new Date().toISOString(),
      },
    };
  }
}
