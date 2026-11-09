import "server-only";
import { getSttProvider } from "./stt";
import { getTtsProvider } from "./tts";
import { FallbackReasoningProvider, getReasoningProvider } from "./reasoning";

export interface ProviderStatus {
  stage: "stt" | "tts" | "reasoning";
  provider: string;
  /** "ai" = live AI service, "rules" = deterministic engine, "simulated" = mock / scripted. */
  kind: "ai" | "rules" | "simulated";
  /** Kept for callers that only need to know whether output is simulated. */
  simulated: boolean;
  configured: boolean;
  /** Engine used when the primary is unavailable (reasoning only). */
  fallback: string | null;
}

/** Safe to send to the browser: names and booleans only, no keys or URLs. */
export function getProviderStatus(): ProviderStatus[] {
  const stt = getSttProvider();
  const tts = getTtsProvider();
  const reasoning = getReasoningProvider();
  const chained = reasoning instanceof FallbackReasoningProvider;
  return [
    { stage: "stt", provider: stt.id, kind: stt.id === "mock-stt" ? "simulated" : "ai", simulated: stt.id === "mock-stt", configured: stt.isConfigured(), fallback: null },
    {
      stage: "reasoning",
      provider: reasoning.id,
      kind: reasoning.id === "rules" ? "rules" : "ai",
      simulated: false,
      configured: chained ? reasoning.primaryConfigured() : reasoning.isConfigured(),
      fallback: chained ? "rules" : null,
    },
    { stage: "tts", provider: tts.id, kind: tts.id === "mock-tts" ? "simulated" : "ai", simulated: tts.id === "mock-tts", configured: tts.isConfigured(), fallback: null },
  ];
}
