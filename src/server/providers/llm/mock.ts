import "server-only";
import type { ReasoningOutput } from "@/server/reliability/reasoning-schema";
import type { ReasoningInput, ReasoningProvider, ReasoningResult } from "./types";

/**
 * SIMULATED reasoning: transparent keyword rules, not a model. It emits the same quote-and-hint shape
 * the real LLM returns, so its output goes through exactly the same normaliser and validator.
 */

const NUMBER = String.raw`(?:\d{1,3}(?:,\d{3})+|\d{3,})`;
const DIGIT_WORD = String.raw`(?:shunya|ek|do|teen|tin|chaa?r|paa?nch|chhe|chhah|saa?t|aath|auth|ath|nau|zero|one|two|three|four|five|six|seven|eight|nine)`;
const PERIOD_HOUR = { subah: 0, dopahar: 12, shaam: 12, raat: 12 } as const;

function find(text: string, re: RegExp): RegExpExecArray | null {
  return re.exec(text);
}

function timeHints(t: string): ReasoningOutput["time"] {
  const none: ReasoningOutput["time"] = { quote: null, kind: null, dayOffset: null, weekday: null, startHour: null, startMinute: null, endHour: null, endMinute: null, confidence: 0 };
  const to24 = (period: string | undefined, h: number) => {
    const p = period?.toLowerCase() as keyof typeof PERIOD_HOUR | undefined;
    if (p && p !== "subah" && h < 12 && !(p === "dopahar" && h >= 8)) return h + PERIOD_HOUR[p];
    return h;
  };
  const day = (s: string | undefined) => (s?.toLowerCase().startsWith("kal") ? 1 : s?.toLowerCase().startsWith("aaj") ? 0 : null);

  const between = find(t, /(kal\s+|aaj\s+)?(subah|dopahar|shaam|raat)?\s*(\d{1,2})\s*se\s*(\d{1,2})\s*(?:baje\s*)?ke\s*beech/i);
  if (between) {
    const [q, d, p, a, b] = between;
    return { ...none, quote: q.trim(), kind: "BETWEEN", dayOffset: day(d), startHour: to24(p, +a), endHour: to24(p, +b), confidence: 0.8 };
  }
  const at = find(t, /(kal\s+|aaj\s+)?(subah|dopahar|shaam|raat)\s*(\d{1,2})\s*baje(\s*ke\s*baad)?/i);
  if (at) {
    const [q, d, p, h, after] = at;
    return { ...none, quote: q.trim(), kind: after ? "AFTER" : "AT", dayOffset: day(d), startHour: to24(p, +h), confidence: 0.8 };
  }
  const kalSubah = find(t, /kal\s+subah/i);
  if (kalSubah) return { ...none, quote: kalSubah[0], kind: "BETWEEN", dayOffset: 1, startHour: 9, endHour: 12, confidence: 0.7 };
  const weekday = find(t, /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (weekday) return { ...none, quote: weekday[0], kind: "DATE_ONLY", weekday: weekday[1].toLowerCase() as ReasoningOutput["time"]["weekday"], confidence: 0.8 };
  const kal = find(t, /\bkal\b/i);
  if (kal) return { ...none, quote: kal[0], kind: "DATE_ONLY", dayOffset: 1, confidence: 0.7 };
  return none;
}

export class MockReasoningProvider implements ReasoningProvider {
  readonly id = "mock-llm" as const;

  isConfigured(): boolean {
    return true;
  }

  async extract({ transcript: t }: ReasoningInput): Promise<ReasoningResult> {
    const started = performance.now();

    const order =
      find(t, new RegExp(String.raw`order\s*(?:no\.?|number)?\s*#?\s*(?:${NUMBER}|${DIGIT_WORD}(?:\s+${DIGIT_WORD}){2,})`, "i")) ??
      find(t, new RegExp(String.raw`\b${NUMBER}\b(?=\s*(?:ka|ke|ki|wala|wali|,|$))`, "i"));

    const q = (re: RegExp) => find(t, re)?.[0] ?? null;
    const unavailable = q(/ghar pe nahi|not at home|available nahi|phone nahi utha\w*|bahar gaye/i);
    const address = q(/address\s*(?:galat|is wrong)|building hi nahi|galat location/i);
    const damaged = q(/damaged|phata hua|refuse\w*|lene se mana/i);
    const instruction = q(/reception pe chhod do|leave it at reception|gate number \d+ se aana/i);
    const neighbour = q(/neighbou?r/i);
    const time = timeHints(t);

    const issue: ReasoningOutput["issue"] = damaged
      ? { value: "PACKAGE_UNDELIVERABLE", quote: damaged, confidence: 0.8 }
      : address
        ? { value: "WRONG_ADDRESS", quote: address, confidence: 0.8 }
        : unavailable
          ? { value: "CUSTOMER_UNAVAILABLE", quote: unavailable, confidence: 0.8 }
          : instruction
            ? { value: "UNCLEAR_INSTRUCTIONS", quote: instruction, confidence: 0.8 }
            : time.quote
              ? { value: "RESCHEDULE_REQUEST", quote: time.quote, confidence: 0.7 }
              : { value: null, quote: null, confidence: 0 };

    const action: ReasoningOutput["requestedAction"] = damaged
      ? { value: "MARK_DELIVERY_FAILED", quote: damaged, confidence: 0.75 }
      : address
        ? { value: "FLAG_ADDRESS_ISSUE", quote: address, confidence: 0.75 }
        : neighbour
          ? { value: "ESCALATE_TO_DISPATCHER", quote: neighbour, confidence: 0.75 }
          : instruction
            ? { value: "UPDATE_INSTRUCTIONS", quote: instruction, confidence: 0.75 }
            : time.quote
              ? { value: "RESCHEDULE", quote: time.quote, confidence: 0.75 }
              : unavailable
                ? { value: "MARK_CUSTOMER_UNAVAILABLE", quote: unavailable, confidence: 0.75 }
                : { value: null, quote: null, confidence: 0 };

    const raw: ReasoningOutput = {
      orderReference: { spoken: order?.[0] ?? null, confidence: order ? 0.9 : 0 },
      issue,
      requestedAction: action,
      time,
      notes: instruction ? { value: instruction, quote: instruction, confidence: 0.85 } : { value: null, quote: null, confidence: 0 },
      ambiguities: [
        ...(order ? [] : ["No order number found in transcript."]),
        ...(action.value ? [] : ["Could not tell what should be done."]),
      ],
    };

    return {
      raw,
      provenance: { provider: this.id, simulated: true, latencyMs: Math.round(performance.now() - started), createdAt: new Date().toISOString() },
    };
  }
}
