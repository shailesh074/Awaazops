import "server-only";
import { getServerEnv } from "@/server/env";
import { ClaudeReasoningProvider } from "./claude";
import { MockReasoningProvider } from "./mock";
import type { ReasoningProvider } from "./types";

export type * from "./types";

export function getReasoningProvider(): ReasoningProvider {
  return getServerEnv().AWAAZ_LLM_PROVIDER === "claude" ? new ClaudeReasoningProvider() : new MockReasoningProvider();
}
