import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getServerEnv } from "@/server/env";
import { reasoningOutputSchema } from "@/server/reliability/reasoning-schema";
import { ProviderError } from "../errors";
import type { ReasoningInput, ReasoningProvider, ReasoningResult } from "./types";

/**
 * OPTIONAL LLM enhancement (AWAAZ_REASONING_PROVIDER=claude). Never required: when it is not configured,
 * fails, refuses or times out, the fallback provider runs the deterministic rules engine instead.
 *
 * Reasoning with Claude via the Anthropic SDK: structured output constrained to `reasoningOutputSchema`.
 * The model returns quotes and hints only; digits, offsets and dates are derived by the normaliser, and
 * everything is re-verified by the validator. Output is untrusted until then.
 */

const LANGUAGE_NAMES = { hi: "Hindi", en: "Indian English", "hi-en": "Hinglish (Hindi-English code-mixed)" } as const;

/** Static so it is cacheable across requests; per-request data goes in the user turn. */
export const SYSTEM_PROMPT = `You read transcripts of voice reports from delivery agents in India and extract what happened, for an operations system that will verify your output against its order database before anything changes.

Transcripts come from speech-to-text and may be Hindi (Devanagari or romanised), Indian English, or Hinglish, with recognition errors. Agents speak casually ("boss", "sir", "bhai").

Rules:
- Every quote must be copied exactly, character for character, from the transcript. Never fix spelling, never paraphrase inside a quote, never quote words that are not there. If you cannot quote it, use null.
- orderReference.spoken: the words naming the order number exactly as transcribed (e.g. "order 4,821", "4821 wala", "char auth do ek"). Do not convert words to digits yourself. Null if no order number was said.
- issue: what went wrong. requestedAction: what the agent or customer wants done:
  RESCHEDULE (a new time or day), MARK_CUSTOMER_UNAVAILABLE (customer not reachable, no new time), FLAG_ADDRESS_ISSUE (wrong or unfindable address), UPDATE_INSTRUCTIONS (new delivery instructions such as gate, reception, landmark), MARK_DELIVERY_FAILED (refused, damaged, cannot be delivered), ESCALATE_TO_DISPATCHER (needs a human decision, e.g. hand over to a neighbour without ID, or anything you cannot classify confidently).
- time: only if a time or day was mentioned. Give hints, not dates: dayOffset (aaj 0, kal 1, parson 2) or weekday, and hours on a 24-hour clock applying Hindi day periods (subah morning, dopahar afternoon, shaam evening, raat night; "shaam 6 baje" is 18). "ke baad" means AFTER, "se pehle" BEFORE, "X se Y ke beech" BETWEEN. A day with no hour is DATE_ONLY.
- notes: a short English note for the dispatcher when there is a correction or instruction worth recording (e.g. "Correct flat is 204, not 402"). Quote the words it is based on.
- Never guess. If something is missing, unclear or contradictory, leave the field null and say what is unclear in ambiguities. A wrong confident answer is worse than a null.
- confidence reflects how sure you are of each field given possible transcription errors.`;

export class ClaudeReasoningProvider implements ReasoningProvider {
  readonly id = "claude" as const;

  constructor(private readonly client?: Anthropic) {}

  isConfigured(): boolean {
    return Boolean(getServerEnv().ANTHROPIC_API_KEY);
  }

  async extract({ transcript, language, signal }: ReasoningInput): Promise<ReasoningResult> {
    const env = getServerEnv();
    if (!this.client && !env.ANTHROPIC_API_KEY) {
      throw new ProviderError(this.id, "NOT_CONFIGURED", "ANTHROPIC_API_KEY is not set.");
    }
    const client = this.client ?? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 1 });

    const started = performance.now();
    let response;
    try {
      response = await client.beta.messages.parse({
        model: env.LLM_MODEL,
        max_tokens: 8000,
        // Server-side fallback if the model declines; routes by refusal category.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: env.LLM_EFFORT, format: betaZodOutputFormat(reasoningOutputSchema) },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: `Spoken language: ${LANGUAGE_NAMES[language]}\n\n<transcript>\n${transcript}\n</transcript>`,
          },
        ],
      }, { signal }); // the fallback timeout aborts the request instead of leaving it running
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new ProviderError(this.id, "NOT_CONFIGURED", "Anthropic rejected the API key.", { cause: err });
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new ProviderError(this.id, "UPSTREAM_ERROR", "Reasoning service is rate limited. Try again shortly.", { cause: err });
      }
      if (err instanceof Anthropic.APIConnectionTimeoutError) {
        throw new ProviderError(this.id, "TIMEOUT", "Reasoning timed out.", { cause: err });
      }
      if (err instanceof Anthropic.APIError) {
        throw new ProviderError(this.id, "UPSTREAM_ERROR", `Reasoning request failed (${err.status ?? "network"}).`, { cause: err });
      }
      // Output that doesn't parse against the schema surfaces as a non-API error from .parse().
      throw new ProviderError(this.id, "INVALID_RESPONSE", "Reasoning output did not match the expected structure.", { cause: err });
    }

    if (response.stop_reason === "refusal") {
      throw new ProviderError(this.id, "INVALID_RESPONSE", "The model declined to process this transcript.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new ProviderError(this.id, "INVALID_RESPONSE", "Reasoning output was cut off.");
    }

    return {
      // Still untrusted: the normaliser re-parses it and the validator re-checks every quote.
      raw: response.parsed_output,
      provenance: {
        provider: this.id,
        simulated: false,
        model: response.model,
        requestId: response.id,
        latencyMs: Math.round(performance.now() - started),
        createdAt: new Date().toISOString(),
      },
    };
  }
}
