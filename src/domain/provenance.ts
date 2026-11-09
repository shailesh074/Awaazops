import { z } from "zod";

/**
 * Every produced artefact carries provenance so the UI never presents simulated output as a real
 * Gnani or LLM result, and never presents deterministic rules as AI. Three kinds of provider:
 *  - live AI services (Gnani Prisma / Timbre, Claude)            → simulated: false
 *  - the deterministic rules engine ("rules")                    → simulated: false, not AI
 *  - mock / scripted demo providers ("mock-*")                   → simulated: true
 */
export const PROVIDER_IDS = [
  "gnani-prisma",
  "gnani-timbre",
  "claude",
  "rules",
  "mock-stt",
  "mock-tts",
  /** Legacy id used only by scripted demo fixtures (seeded reports and the demo lab run). */
  "mock-llm",
] as const;

export const providerIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof providerIdSchema>;

/** Deterministic, non-AI providers. Shown as "Rules", never as Live AI or Simulated. */
export const DETERMINISTIC_PROVIDERS: readonly ProviderId[] = ["rules"];

export const provenanceSchema = z.object({
  provider: providerIdSchema,
  /** True only for mock / scripted providers. Drives the SIMULATED badge. */
  simulated: z.boolean(),
  /** Provider-reported model / version string, when the provider returns one. */
  model: z.string().optional(),
  /** Provider request ID, kept for support/audit when the provider returns one. */
  requestId: z.string().optional(),
  latencyMs: z.number().nonnegative(),
  createdAt: z.iso.datetime(),
  /** Set when this result came from a fallback: the provider that was tried first… */
  fallbackFrom: providerIdSchema.optional(),
  /** …and why it was not used (not configured, timed out, failed, refused, invalid output). */
  fallbackReason: z.string().optional(),
});
export type Provenance = z.infer<typeof provenanceSchema>;

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  "gnani-prisma": "Gnani Prisma v2.5",
  "gnani-timbre": "Gnani Timbre v2.5",
  claude: "Claude (Anthropic)",
  rules: "Deterministic rules",
  "mock-stt": "Mock speech-to-text",
  "mock-tts": "Mock text-to-speech",
  "mock-llm": "Scripted demo data",
};
