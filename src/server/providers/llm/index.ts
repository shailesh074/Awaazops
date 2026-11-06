import "server-only";
import { getServerEnv } from "@/server/env";
import { ProviderError } from "../errors";
import { MockReasoningProvider } from "./mock";
import type { ReasoningInput, ReasoningProvider, ReasoningResult } from "./types";

export type * from "./types";

/** Placeholder for the real LLM adapter — provider choice is still open (PROJECT.md §11). */
class UnselectedLlmProvider implements ReasoningProvider {
  readonly id = "llm" as const;
  isConfigured(): boolean {
    return false;
  }
  async extract(_input: ReasoningInput): Promise<ReasoningResult> {
    throw new ProviderError(this.id, "NOT_IMPLEMENTED", "LLM provider has not been selected yet.");
  }
}

export function getReasoningProvider(): ReasoningProvider {
  return getServerEnv().AWAAZ_LLM_PROVIDER === "llm"
    ? new UnselectedLlmProvider()
    : new MockReasoningProvider();
}
