import "server-only";
import type { AudioInput, SpeechToTextProvider, TranscribeOptions, TranscriptionResult } from "./types";

const DEFAULT_MOCK_TRANSCRIPT =
  "Boss, order 4821 ka customer ghar pe nahi hai. Usne bola shaam 6 baje ke baad delivery karna.";

/**
 * SIMULATED speech-to-text. It does not listen to the audio: it returns a fixed or caller-supplied
 * transcript so the UI and pipeline can be built before Gnani access. Output is always marked simulated.
 */
export class MockSttProvider implements SpeechToTextProvider {
  readonly id = "mock-stt" as const;

  isConfigured(): boolean {
    return true;
  }

  async transcribe(_audio: AudioInput, options: TranscribeOptions): Promise<TranscriptionResult> {
    const started = performance.now();
    const text = options.mockTranscript?.trim() || DEFAULT_MOCK_TRANSCRIPT;
    return {
      text,
      confidence: null,
      segments: [{ text, startMs: null, endMs: null, confidence: null }],
      provenance: {
        provider: this.id,
        simulated: true,
        latencyMs: Math.round(performance.now() - started),
        createdAt: new Date().toISOString(),
      },
    };
  }
}
