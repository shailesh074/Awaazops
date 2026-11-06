import "server-only";
import { getServerEnv } from "@/server/env";
import { PENDING_VERIFICATION, ProviderError } from "../errors";
import type { SynthesisResult, SynthesizeOptions, TextToSpeechProvider } from "./types";

/**
 * Gnani Timbre v2.5 text-to-speech adapter.
 *
 * Deliberately unimplemented until verified against official docs. To complete (step 7):
 *  - auth scheme, endpoint, request body
 *  - voice catalogue per language
 *  - output format (mp3 / wav / pcm) → mimeType
 *  - SSML / prosody support, if any
 */
export class GnaniTimbreProvider implements TextToSpeechProvider {
  readonly id = "gnani-timbre" as const;

  isConfigured(): boolean {
    const env = getServerEnv();
    return Boolean(env.GNANI_API_KEY && env.GNANI_TIMBRE_BASE_URL);
  }

  async synthesize(_text: string, _options: SynthesizeOptions): Promise<SynthesisResult> {
    if (!this.isConfigured()) {
      throw new ProviderError(this.id, "NOT_CONFIGURED", "Gnani Timbre credentials are not set.");
    }
    throw new ProviderError(this.id, "NOT_IMPLEMENTED", PENDING_VERIFICATION);
  }
}
