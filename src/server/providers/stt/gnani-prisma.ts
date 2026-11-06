import "server-only";
import { getServerEnv } from "@/server/env";
import { PENDING_VERIFICATION, ProviderError } from "../errors";
import type { AudioInput, SpeechToTextProvider, TranscribeOptions, TranscriptionResult } from "./types";

/**
 * Gnani Prisma v2.5 speech-to-text adapter.
 *
 * Deliberately unimplemented until verified against official docs. To complete (step 5):
 *  - auth scheme and headers
 *  - sync REST vs. streaming (WebSocket) API
 *  - accepted audio formats / sample rate → convert `audio.mimeType` here if needed
 *  - language code mapping from LanguageCode ("hi" | "en" | "hi-en")
 *  - response shape → map to TranscriptionResult (confidence/segments only if returned)
 */
export class GnaniPrismaProvider implements SpeechToTextProvider {
  readonly id = "gnani-prisma" as const;

  isConfigured(): boolean {
    const env = getServerEnv();
    return Boolean(env.GNANI_API_KEY && env.GNANI_PRISMA_BASE_URL);
  }

  async transcribe(_audio: AudioInput, _options: TranscribeOptions): Promise<TranscriptionResult> {
    if (!this.isConfigured()) {
      throw new ProviderError(this.id, "NOT_CONFIGURED", "Gnani Prisma credentials are not set.");
    }
    throw new ProviderError(this.id, "NOT_IMPLEMENTED", PENDING_VERIFICATION);
  }
}
