import "server-only";
import { z } from "zod";

/**
 * Server-only, Zod-validated environment. Secrets must never use the NEXT_PUBLIC_ prefix.
 *
 * Gnani variable names are PROVISIONAL — they are our own names, chosen before the official
 * documentation was reviewed. Rename/extend them when the integration is verified (PROJECT.md §11).
 */
const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Provider selection. Defaults to mock so the UI can be built before credentials exist.
  AWAAZ_STT_PROVIDER: z.enum(["mock", "gnani-prisma"]).default("mock"),
  AWAAZ_TTS_PROVIDER: z.enum(["mock", "gnani-timbre"]).default("mock"),
  AWAAZ_LLM_PROVIDER: z.enum(["mock", "claude"]).default("mock"),

  // Gnani — one key for all Vachana APIs, sent as `X-API-Key-ID` (docs.gnani.ai, verified 2026-11-06).
  GNANI_API_KEY: optionalString,
  /** Base URL for the Vachana API. Documented: https://api.vachana.ai */
  GNANI_API_BASE_URL: z.url().default("https://api.vachana.ai"),
  /** Prisma model. Omitted in the request for v2.5 (the documented default). */
  GNANI_STT_MODEL: z.enum(["prisma-v2.5", "prisma-v3.0"]).default("prisma-v2.5"),
  /** Output style: `verbatim` (raw) or `transcribe` (inverse text normalisation, e.g. spoken numbers → digits). */
  GNANI_STT_FORMAT: z.enum(["verbatim", "transcribe"]).default("transcribe"),
  /** Timbre model (docs: `timbre-v2.5` recommended; `timbre-v3.0` has a different voice catalog). */
  GNANI_TTS_MODEL: z.enum(["timbre-v2.5"]).default("timbre-v2.5"),
  /** Voices from the documented timbre-v2.5 catalog, one per AwaazOps language. */
  GNANI_TTS_VOICE_HI: z.string().trim().min(1).default("Nalini"),
  GNANI_TTS_VOICE_EN: z.string().trim().min(1).default("Kaveri"),
  GNANI_TTS_VOICE_HINGLISH: z.string().trim().min(1).default("Poorvi"),
  /** Output container: mp3 is small for mobile playback; wav is the documented example. */
  GNANI_TTS_CONTAINER: z.enum(["mp3", "wav"]).default("mp3"),

  // Reasoning LLM — Claude via the Anthropic SDK.
  ANTHROPIC_API_KEY: optionalString,
  LLM_MODEL: z.string().trim().min(1).default("claude-opus-5-5"),
  /** Extraction is short and latency-sensitive; `low` effort keeps it fast. Raise if quality needs it. */
  LLM_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),

  // Supabase (wired in step 8)
  NEXT_PUBLIC_SUPABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parsed lazily so a misconfiguration fails at the first server call with a clear message. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
