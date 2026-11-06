import "server-only";
import type { LanguageCode } from "@/domain";
import { getServerEnv } from "@/server/env";
import { ProviderError } from "../errors";
import { describeGnaniError, gnaniErrorCode, gnaniFetch } from "../gnani-shared";
import type { AudioInput, SpeechToTextProvider, TranscribeOptions, TranscriptionResult } from "./types";

/**
 * Gnani Prisma speech-to-text via the Vachana REST API.
 *
 * Contract source: https://docs.gnani.ai/api/STT/speech-to-text and /api/introduction/quick-start
 * (read 2026-11-06). Everything below is taken from those pages:
 *  - POST {base}/stt/v3, multipart/form-data, header `X-API-Key-ID`
 *  - fields: `audio_file` (required, ≤ 30 s), `language_code` (required), `model` (omit → prisma-v2.5),
 *    `format` (`verbatim` | `transcribe`; v2.5 supports only these two)
 *  - 200: `{ success, request_id, transcript, model, processing_time, end_to_end_latency, truncated?, output? }`
 *    — no confidence or timestamps are documented, so none are reported.
 *  - `transcript: ""` means no speech (not an error)
 *  - formats: WAV, MP3, OGG, FLAC, AAC, M4A — WebM is NOT listed, so the client converts to WAV first
 *  - only one active request per key (429 RATE_LIMITED otherwise)
 */

export const PRISMA_MAX_DURATION_MS = 30_000;

/**
 * AwaazOps language → Prisma `language_code`.
 * There is no dedicated Hinglish code. The docs state `en-IN` "accepts English-Hindi mixed audio and
 * generates output in English (Latin script)", which is the right register for Hinglish field reports.
 */
export const PRISMA_LANGUAGE: Record<LanguageCode, string> = {
  hi: "hi-IN",
  en: "en-IN",
  "hi-en": "en-IN",
};

/** MIME types for the documented formats (WAV, MP3, OGG, FLAC, AAC, M4A). */
const ACCEPTED: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
};

const REQUEST_TIMEOUT_MS = 20_000;

interface PrismaSuccess {
  success: true;
  request_id?: string;
  transcript: string;
  model?: string;
  truncated?: boolean;
}

export class GnaniPrismaProvider implements SpeechToTextProvider {
  readonly id = "gnani-prisma" as const;

  isConfigured(): boolean {
    return Boolean(getServerEnv().GNANI_API_KEY);
  }

  async transcribe(audio: AudioInput, options: TranscribeOptions): Promise<TranscriptionResult> {
    const env = getServerEnv();
    if (!env.GNANI_API_KEY) throw new ProviderError(this.id, "NOT_CONFIGURED", "GNANI_API_KEY is not set.");

    const mime = audio.mimeType.split(";")[0].trim().toLowerCase();
    const ext = ACCEPTED[mime];
    if (!ext) {
      throw new ProviderError(
        this.id,
        "UNSUPPORTED_INPUT",
        `Audio type "${audio.mimeType}" is not a documented Prisma format (WAV, MP3, OGG, FLAC, AAC, M4A).`,
      );
    }
    if (audio.data.byteLength === 0) throw new ProviderError(this.id, "UNSUPPORTED_INPUT", "Audio is empty.");
    if (audio.durationMs && audio.durationMs > PRISMA_MAX_DURATION_MS + 500) {
      throw new ProviderError(this.id, "UNSUPPORTED_INPUT", "Prisma accepts clips up to 30 seconds.");
    }

    const form = new FormData();
    form.set("audio_file", new Blob([audio.data], { type: mime }), `report.${ext}`);
    form.set("language_code", PRISMA_LANGUAGE[options.language]);
    form.set("format", env.GNANI_STT_FORMAT);
    if (env.GNANI_STT_MODEL !== "prisma-v2.5") form.set("model", env.GNANI_STT_MODEL);

    const url = `${env.GNANI_API_BASE_URL.replace(/\/$/, "")}/stt/v3`;
    const send = () =>
      fetch(url, {
        method: "POST",
        headers: { "X-API-Key-ID": env.GNANI_API_KEY! },
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

    const started = performance.now();
    const res = await gnaniFetch(this.id, send);
    const latencyMs = Math.round(performance.now() - started);

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // non-JSON body; handled below
    }

    if (!res.ok) {
      throw new ProviderError(
        this.id,
        gnaniErrorCode(res.status),
        `Prisma request failed (${res.status}) — ${describeGnaniError(res.status, body)}`,
      );
    }

    const ok = body as Partial<PrismaSuccess> | null;
    if (!ok || ok.success !== true || typeof ok.transcript !== "string") {
      throw new ProviderError(this.id, "INVALID_RESPONSE", "Unexpected response shape from Prisma.");
    }
    if (ok.truncated) console.warn(`[prisma] transcript truncated (request ${ok.request_id ?? "unknown"})`);

    const text = ok.transcript.trim();
    return {
      text,
      confidence: null, // not provided by the API
      segments: text ? [{ text, startMs: null, endMs: null, confidence: null }] : [],
      provenance: {
        provider: this.id,
        simulated: false,
        model: ok.model,
        requestId: ok.request_id,
        latencyMs,
        createdAt: new Date().toISOString(),
      },
    };
  }
}
