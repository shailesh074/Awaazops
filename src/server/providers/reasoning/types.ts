import "server-only";
import type { LanguageCode, Provenance } from "@/domain";

export interface ReasoningInput {
  transcript: string;
  language: LanguageCode;
  /** ISO timestamp used to resolve relative times ("kal", "shaam"); passed to the normaliser, not the model. */
  referenceTime: string;
  /** Aborted when the caller gives up (e.g. the fallback timeout). Providers that call out should honour it. */
  signal?: AbortSignal;
}

export interface ReasoningResult {
  /**
   * Raw, UNTRUSTED output in the `reasoningOutputSchema` shape (quotes + hints). The normaliser re-parses it
   * and derives digits/offsets/dates; the validator re-checks every quote. Nothing consumes it directly.
   */
  raw: unknown;
  provenance: Provenance;
}

/** Every reasoning engine — deterministic rules or an LLM — implements this one interface. */
export interface ReasoningProvider {
  readonly id: "rules" | "claude";
  isConfigured(): boolean;
  extract(input: ReasoningInput): Promise<ReasoningResult>;
}
