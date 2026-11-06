import "server-only";
import type { LanguageCode } from "@/domain";
import { getServerEnv } from "@/server/env";
import { ProviderError } from "../errors";
import { describeGnaniError, gnaniErrorCode, gnaniFetch } from "../gnani-shared";
import { speakable } from "./speakable";
import type { SynthesisResult, SynthesizeOptions, TextToSpeechProvider } from "./types";

/**
 * Gnani Timbre v2.5 text-to-speech via the Vachana REST API.
 *
 * Contract source: https://docs.gnani.ai/api/TTS/tts-inference and /api/TTS/available-voices (read 2026-11-06):
 *  - POST {base}/api/v1/tts/inference, JSON body, header `X-API-Key-ID`
 *  - body: `text`, `model` ("timbre-v2.5"), `voice`, `language`, `speed` (0.85–1.15), `audio_config`
 *    (`sample_rate`, `num_channels`, `sample_width`, `encoding`, `container`, `bitrate` for mp3)
 *  - 200: raw audio bytes; Content-Type follows the container (mp3 → audio/mpeg, wav → audio/wav)
 *  - errors: `{ success:false, message, status_code }` (400/500), `{ detail: { error_code, … } }` (auth/429)
 *  - language codes include `hi-IN`, `en-IN` and `hi-en` (code-mixed Hindi–English)
 *  - numbers, IDs and dates should be passed as spoken words → `speakable()`
 */

/** AwaazOps language → Timbre `language` (documented values). */
export const TIMBRE_LANGUAGE: Record<LanguageCode, string> = { hi: "hi-IN", en: "en-IN", "hi-en": "hi-en" };

/** Prompts are short sentences; this guards against an unexpected 500 for over-long text (limit not documented). */
const MAX_TEXT_CHARS = 600;
const REQUEST_TIMEOUT_MS = 20_000;

export class GnaniTimbreProvider implements TextToSpeechProvider {
  readonly id = "gnani-timbre" as const;

  isConfigured(): boolean {
    return Boolean(getServerEnv().GNANI_API_KEY);
  }

  voiceFor(language: LanguageCode): string {
    const env = getServerEnv();
    return { hi: env.GNANI_TTS_VOICE_HI, en: env.GNANI_TTS_VOICE_EN, "hi-en": env.GNANI_TTS_VOICE_HINGLISH }[language];
  }

  async synthesize(text: string, options: SynthesizeOptions): Promise<SynthesisResult> {
    const env = getServerEnv();
    if (!env.GNANI_API_KEY) throw new ProviderError(this.id, "NOT_CONFIGURED", "GNANI_API_KEY is not set.");

    const spoken = speakable(text, options.language).trim();
    if (!spoken) throw new ProviderError(this.id, "UNSUPPORTED_INPUT", "Nothing to speak.");
    if (spoken.length > MAX_TEXT_CHARS) throw new ProviderError(this.id, "UNSUPPORTED_INPUT", "Prompt is too long to synthesize.");

    const mp3 = env.GNANI_TTS_CONTAINER === "mp3";
    const body = {
      text: spoken,
      model: env.GNANI_TTS_MODEL,
      voice: options.voice ?? this.voiceFor(options.language),
      language: TIMBRE_LANGUAGE[options.language],
      speed: 1.0,
      audio_config: mp3
        ? { sample_rate: 24000, num_channels: 1, container: "mp3", bitrate: "64k" }
        : { sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "wav" },
    };

    const url = `${env.GNANI_API_BASE_URL.replace(/\/$/, "")}/api/v1/tts/inference`;
    const started = performance.now();
    const res = await gnaniFetch(this.id, () =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key-ID": env.GNANI_API_KEY! },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    );

    if (!res.ok) {
      let errBody: unknown = null;
      try {
        errBody = await res.json();
      } catch {
        // non-JSON error body
      }
      throw new ProviderError(this.id, gnaniErrorCode(res.status), `Timbre request failed (${res.status}) — ${describeGnaniError(res.status, errBody)}`);
    }

    const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!mimeType.startsWith("audio/")) {
      throw new ProviderError(this.id, "INVALID_RESPONSE", `Expected audio from Timbre, got "${mimeType || "no content type"}".`);
    }
    const audio = await res.arrayBuffer();
    if (audio.byteLength === 0) throw new ProviderError(this.id, "INVALID_RESPONSE", "Timbre returned empty audio.");

    return {
      audio,
      mimeType,
      text,
      provenance: {
        provider: this.id,
        simulated: false,
        model: `${env.GNANI_TTS_MODEL} · ${body.voice}`,
        latencyMs: Math.round(performance.now() - started),
        createdAt: new Date().toISOString(),
      },
    };
  }
}
