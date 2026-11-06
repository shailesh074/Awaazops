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
  AWAAZ_LLM_PROVIDER: z.enum(["mock", "llm"]).default("mock"),

  // Gnani (provisional)
  GNANI_API_KEY: optionalString,
  GNANI_PRISMA_BASE_URL: optionalString,
  GNANI_TIMBRE_BASE_URL: optionalString,

  // LLM (provider TBD)
  LLM_API_KEY: optionalString,
  LLM_MODEL: optionalString,

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
