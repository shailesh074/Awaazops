import "server-only";
import type { LanguageCode, Provenance } from "@/domain";

export interface AudioInput {
  data: ArrayBuffer;
  /** As recorded by the browser, e.g. "audio/webm;codecs=opus". Adapters convert if the provider requires it. */
  mimeType: string;
  durationMs?: number;
}

export interface TranscribeOptions {
  language: LanguageCode;
  /** Mock-only: lets the lab / demo drive a known transcript. Ignored by real providers. */
  mockTranscript?: string;
}

export interface TranscriptionResult {
  text: string;
  /** Null when the provider does not report confidence. Never fabricated. */
  confidence: number | null;
  segments: Array<{
    text: string;
    startMs: number | null;
    endMs: number | null;
    confidence: number | null;
  }>;
  provenance: Provenance;
}

export interface SpeechToTextProvider {
  readonly id: "gnani-prisma" | "mock-stt";
  isConfigured(): boolean;
  transcribe(audio: AudioInput, options: TranscribeOptions): Promise<TranscriptionResult>;
}
