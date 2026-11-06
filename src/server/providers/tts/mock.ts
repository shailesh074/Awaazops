import "server-only";
import type { SynthesisResult, SynthesizeOptions, TextToSpeechProvider } from "./types";

/** SIMULATED text-to-speech: returns the text with no audio. The UI shows the text and a SIMULATED badge. */
export class MockTtsProvider implements TextToSpeechProvider {
  readonly id = "mock-tts" as const;

  isConfigured(): boolean {
    return true;
  }

  async synthesize(text: string, _options: SynthesizeOptions): Promise<SynthesisResult> {
    return {
      audio: null,
      mimeType: null,
      text,
      provenance: {
        provider: this.id,
        simulated: true,
        latencyMs: 0,
        createdAt: new Date().toISOString(),
      },
    };
  }
}
