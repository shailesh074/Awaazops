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
   * Raw, UNTRUSTED output in the `reasoningOutputSchema` shape (quotes + hints). The normaliser re-parses it
   * and derives digits/offsets/dates; the validator re-checks every quote. Nothing consumes it directly.
   */
  raw: unknown;
  provenance: Provenance;
}

export interface ReasoningProvider {
  readonly id: "claude" | "mock-llm";
  isConfigured(): boolean;
  extract(input: ReasoningInput): Promise<ReasoningResult>;
}
