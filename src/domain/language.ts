import { z } from "zod";

/**
 * AwaazOps' own language identifiers. Provider adapters map these to whatever codes the provider
 * documents — provider codes are intentionally NOT assumed here.
 */
export const LANGUAGE_CODES = ["hi", "en", "hi-en"] as const;
export const languageCodeSchema = z.enum(LANGUAGE_CODES);
export type LanguageCode = z.infer<typeof languageCodeSchema>;

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  hi: "Hindi",
  en: "English (India)",
  "hi-en": "Hinglish",
};
