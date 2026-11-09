import "server-only";
import { getServerEnv, reasoningProviderSetting } from "@/server/env";
import { ClaudeReasoningProvider } from "./claude";
import { FallbackReasoningProvider } from "./fallback";
import { RulesReasoningProvider } from "./rules";
import type { ReasoningProvider } from "./types";

export type * from "./types";
export { FallbackReasoningProvider } from "./fallback";
export { RulesReasoningProvider } from "./rules";

/**
 * Reasoning engine selection. Default: deterministic rules — no API key, no paid service.
 * With AWAAZ_REASONING_PROVIDER=claude the LLM is an optional enhancement; unless
 * AWAAZ_REASONING_FALLBACK=none, any LLM failure falls back to the rules engine.
 */
export function getReasoningProvider(): ReasoningProvider {
  const env = getServerEnv();
  const rules = new RulesReasoningProvider();
  if (reasoningProviderSetting() === "rules") return rules;

  const llm = new ClaudeReasoningProvider();
  return env.AWAAZ_REASONING_FALLBACK === "rules" ? new FallbackReasoningProvider(llm, rules, env.LLM_TIMEOUT_MS) : llm;
}
