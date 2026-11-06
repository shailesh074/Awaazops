import "server-only";
import { getSttProvider } from "./stt";
import { getTtsProvider } from "./tts";
import { getReasoningProvider } from "./llm";

export interface ProviderStatus {
  stage: "stt" | "tts" | "reasoning";
  provider: string;
  simulated: boolean;
  configured: boolean;
}

/** Safe to send to the browser: names and booleans only, no keys or URLs. */
export function getProviderStatus(): ProviderStatus[] {
  const stt = getSttProvider();
  const tts = getTtsProvider();
  const llm = getReasoningProvider();
  return [
    { stage: "stt", provider: stt.id, simulated: stt.id === "mock-stt", configured: stt.isConfigured() },
    { stage: "reasoning", provider: llm.id, simulated: llm.id === "mock-llm", configured: llm.isConfigured() },
    { stage: "tts", provider: tts.id, simulated: tts.id === "mock-tts", configured: tts.isConfigured() },
  ];
}
