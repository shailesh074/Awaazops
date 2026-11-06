import { z } from "zod";

/**
 * Every AI-produced artefact carries provenance so the UI can never present simulated output
 * as a real Gnani (or LLM) result. `simulated: true` is reserved for mock providers.
 */
export const PROVIDER_IDS = [
  "gnani-prisma",
  "gnani-timbre",
  "llm",
  "mock-stt",
  "mock-tts",
  "mock-llm",
] as const;

export const providerIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof providerIdSchema>;

export const provenanceSchema = z.object({
  provider: providerIdSchema,
  /** True only for mock providers. Drives the SIMULATED badge. */
  simulated: z.boolean(),
  /** Provider-reported model / version string, when the provider returns one. */
  model: z.string().optional(),
  latencyMs: z.number().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type Provenance = z.infer<typeof provenanceSchema>;

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  "gnani-prisma": "Gnani Prisma v2.5",
  "gnani-timbre": "Gnani Timbre v2.5",
  llm: "LLM reasoning",
  "mock-stt": "Mock speech-to-text",
  "mock-tts": "Mock text-to-speech",
  "mock-llm": "Mock reasoning",
};
