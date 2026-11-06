import "server-only";
import type { LanguageCode, Provenance } from "@/domain";

export interface ReasoningInput {
  transcript: string;
  language: LanguageCode;
  /** ISO timestamp in Asia/Kolkata used to resolve relative times ("kal", "shaam"). */
  referenceTime: string;
}

export interface ReasoningResult {
  /**
   * Raw, UNTRUSTED model output. The Reliability Engine parses it against `extractionPayloadSchema`
   * and re-checks evidence spans; nothing downstream consumes this value directly.
   */
  raw: unknown;
  provenance: Provenance;
}

export interface ReasoningProvider {
  readonly id: "llm" | "mock-llm";
  isConfigured(): boolean;
  extract(input: ReasoningInput): Promise<ReasoningResult>;
}
