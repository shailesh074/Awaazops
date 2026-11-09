import { z } from "zod";
import { ACTION_TYPES, ISSUE_TYPES } from "@/domain";

/**
 * What a reasoning provider (LLM or mock) must return. It deliberately contains only QUOTES and HINTS:
 *  - quotes are copied verbatim from the transcript — character offsets are computed by us, not the model;
 *  - the order number is returned as spoken ("char auth do ek", "4,821") — digits are derived by us;
 *  - times are returned as day/hour hints — calendar dates are resolved by us in Asia/Kolkata.
 * The model never does arithmetic we can do deterministically.
 *
 * Every property is required (nullable instead of optional) so the schema is valid for structured outputs.
 */
const quote = z.string().nullable().describe("Exact substring of the transcript, copied character for character, or null.");
/** Model-reported confidence, or null when the provider has no real estimate (the rules engine never invents one). */
const confidence = z.number().min(0).max(1).nullable().describe("Your confidence in this field, 0 to 1, or null if you cannot estimate it.");

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export const reasoningOutputSchema = z.object({
  orderReference: z.object({
    spoken: quote.describe("The words naming the order number exactly as they appear in the transcript, e.g. 'order 4,821' or 'char auth do ek'. Null if no order number was said."),
    confidence,
  }),
  issue: z.object({
    value: z.enum(ISSUE_TYPES).nullable(),
    quote,
    confidence,
  }),
  requestedAction: z.object({
    value: z.enum(ACTION_TYPES).nullable(),
    quote,
    confidence,
  }),
  time: z.object({
    quote: quote.describe("The time phrase exactly as spoken, e.g. 'shaam 6 baje ke baad'. Null if no time was mentioned."),
    kind: z.enum(["AFTER", "BEFORE", "BETWEEN", "AT", "DATE_ONLY"]).nullable(),
    dayOffset: z.number().int().nullable().describe("0 = today (aaj), 1 = tomorrow (kal), 2 = day after (parson). Null if a weekday is named instead or no day is implied."),
    weekday: z.enum(WEEKDAYS).nullable().describe("Named weekday, if the speaker named one."),
    startHour: z.number().int().nullable().describe("24-hour clock. Apply Hindi day periods: subah = morning, dopahar = afternoon, shaam = evening (shaam 6 = 18), raat = night."),
    startMinute: z.number().int().nullable(),
    endHour: z.number().int().nullable().describe("24-hour clock; only for BETWEEN."),
    endMinute: z.number().int().nullable(),
    confidence,
  }),
  notes: z.object({
    value: z.string().nullable().describe("Short English note for the dispatcher (corrections, instructions, context). Null if nothing beyond the fields above."),
    quote: quote.describe("The transcript words the note is based on."),
    confidence,
  }),
  ambiguities: z.array(z.string()).describe("Anything unclear, missing or contradictory, in plain English. Empty if none."),
});

export type ReasoningOutput = z.infer<typeof reasoningOutputSchema>;
