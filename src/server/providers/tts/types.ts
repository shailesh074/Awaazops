import "server-only";
import type { LanguageCode, Provenance } from "@/domain";

export interface SynthesizeOptions {
  language: LanguageCode;
  /** Provider voice identifier — values come from the provider's documented voice list. */
  voice?: string;
}

export interface SynthesisResult {
  /** Null when no audio was produced (the mock never produces audio). */
  audio: ArrayBuffer | null;
  mimeType: string | null;
  text: string;
  provenance: Provenance;
}

export interface TextToSpeechProvider {
  readonly id: "gnani-timbre" | "mock-tts";
  isConfigured(): boolean;
  synthesize(text: string, options: SynthesizeOptions): Promise<SynthesisResult>;
}
