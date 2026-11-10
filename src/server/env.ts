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
  /** Reasoning engine: "rules" (deterministic, default, no API key) or "claude" (optional LLM enhancement). */
  AWAAZ_REASONING_PROVIDER: z.enum(["rules", "claude"]).optional(),
  /** Legacy name for the setting above; "mock" maps to "rules". */
  AWAAZ_LLM_PROVIDER: z.enum(["mock", "rules", "claude"]).optional(),
  /** When an LLM is selected: fall back to the rules engine on any LLM failure ("rules", default) or not ("none"). */
  AWAAZ_REASONING_FALLBACK: z.enum(["rules", "none"]).default("rules"),

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

  // Optional reasoning LLM — Claude via the Anthropic SDK. Not required: the rules engine needs no key.
  ANTHROPIC_API_KEY: optionalString,
  LLM_MODEL: z.string().trim().min(1).default("claude-opus-5-5"),
  /** Extraction is short and latency-sensitive; `low` effort keeps it fast. Raise if quality needs it. */
  LLM_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  /** After this long the LLM call is abandoned and the rules engine answers instead. */
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),

  // Data backend: "memory" = demo store, no sign-in; "supabase" = Postgres + Auth + Storage.
  AWAAZ_DATA_BACKEND: z.enum(["memory", "supabase"]).default("memory"),
  NEXT_PUBLIC_SUPABASE_URL: optionalString,
  /** Public by design (RLS protects data). Supabase also calls this the publishable key. */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  /** Server-only. Bypasses RLS — used solely by the server pipeline and admin scripts. */
  SUPABASE_SERVICE_ROLE_KEY: optionalString,

  /** Set by Vercel itself: "production" on the production deployment, "preview" on branch/PR deployments. */
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
}).superRefine((env, ctx) => {
  // A production deployment must never fall back to the demo store or simulated speech silently.
  // Demo mode remains available locally and on preview deployments.
  if (env.VERCEL_ENV === "production") {
    const required = [
      ["AWAAZ_DATA_BACKEND", env.AWAAZ_DATA_BACKEND === "supabase", "must be \"supabase\" in production (the in-memory demo store is not allowed)"],
      ["AWAAZ_STT_PROVIDER", env.AWAAZ_STT_PROVIDER === "gnani-prisma", "must be \"gnani-prisma\" in production (simulated speech-to-text is not allowed)"],
      ["AWAAZ_TTS_PROVIDER", env.AWAAZ_TTS_PROVIDER === "gnani-timbre", "must be \"gnani-timbre\" in production (simulated voice is not allowed)"],
      ["GNANI_API_KEY", Boolean(env.GNANI_API_KEY), "required in production"],
    ] as const;
    for (const [key, ok, message] of required) if (!ok) ctx.addIssue({ code: "custom", path: [key], message });
  }
  if (env.AWAAZ_DATA_BACKEND !== "supabase") return;
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
    if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "required when AWAAZ_DATA_BACKEND=supabase" });
  }
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const isSupabaseBackend = () => getServerEnv().AWAAZ_DATA_BACKEND === "supabase";

/** Effective reasoning engine, honouring the legacy AWAAZ_LLM_PROVIDER name. Defaults to "rules". */
export function reasoningProviderSetting(): "rules" | "claude" {
  const env = getServerEnv();
  return env.AWAAZ_REASONING_PROVIDER ?? (env.AWAAZ_LLM_PROVIDER === "claude" ? "claude" : "rules");
}

let cached: ServerEnv | undefined;

/** Parsed lazily so a misconfiguration fails at the first server call with a clear message. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  // A blank `KEY=` line in an env file means "not set", so defaults apply instead of failing validation.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""));
  const parsed = serverEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
