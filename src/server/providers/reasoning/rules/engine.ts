import type { ReasoningOutput } from "@/server/reliability/reasoning-schema";
import { spokenToDigits } from "@/server/reliability/normalise";
import { ISSUE_LABELS } from "@/lib/labels";
import {
  ACCESS_PROBLEM_PATTERNS,
  AFTER,
  B,
  BAJE,
  BEFORE,
  BETWEEN_TAIL,
  DAY,
  DAY_WORD,
  DIGIT_WORD,
  E,
  ESCALATE_PATTERNS,
  HALF,
  HOUR,
  HOUR_WORDS,
  ISSUE_RULES,
  LATER_PATTERNS,
  NUMBER,
  ORDER_KEYWORD,
  ORDER_NUMBER_WORD,
  ORDER_SUFFIX,
  PERIOD,
  PERIOD_WORD,
  TO,
  WEEKDAY,
  WEEKDAY_WORD,
} from "./lexicon";

/**
 * Deterministic reasoning: lexicon rules over the transcript. Pure and side-effect free.
 * Returns quotes (exact transcript substrings) and hints, like any reasoning provider; digits, offsets
 * and dates are derived later by the normaliser, and everything is re-verified by the validator.
 * Confidence is null throughout: a rule match is not a probability, and none is invented.
 */

const re = (src: string, flags = "iu") => new RegExp(src, flags);
/**
 * One spoken digit: a digit word, or a single digit. Prisma on hi-IN writes spoken digits spaced apart
 * ("ऑर्डर 4 9 5 2", verified live 2026-11-09), so single digits must count as sequence members too.
 */
const WORD = `(?:${DIGIT_WORD}|\\d|[०-९])${E}`;
const SEQ = `${WORD}(?:[\\s,]+${WORD}){2,}`;
/** An hour can never start inside a time ("07:00" must not yield "00") or a longer number. */
const HOUR_START = `(?<![:\\d०-९])`;
/** Hour with optional minutes — Prisma writes "शाम 07:00 बजे" (verified live 2026-11-09). */
const HOUR_MIN = `${HOUR_START}(${HOUR})(?::([0-5]\\d))?`;

interface Hit {
  quote: string;
  index: number;
}
const first = (text: string, patterns: string[]): Hit | null => {
  let best: Hit | null = null;
  for (const p of patterns) {
    const m = re(`${B}(?:${p})`).exec(text);
    if (m && (!best || m.index < best.index)) best = { quote: m[0], index: m.index };
  }
  return best;
};

// ── Order reference ───────────────────────────────────────────────────────────────────────────────

function findOrderReference(t: string): { spoken: string | null; ambiguities: string[] } {
  const patterns = [
    `${B}${ORDER_KEYWORD}${E}\\s*(?:${ORDER_NUMBER_WORD}\\s*)?[:#]?\\s*(?:${NUMBER}${E}|${SEQ})`,
    `${B}${NUMBER}${E}(?=\\s*${ORDER_SUFFIX}${E})`,
    `${B}${SEQ}(?=\\s*${ORDER_SUFFIX}${E})`,
    `${B}#\\s?${NUMBER}${E}`,
  ];
  const hits: Array<Hit & { digits: string | null }> = [];
  for (const p of patterns) {
    for (const m of t.matchAll(re(p, "giu"))) {
      const quote = m[0].trim();
      const index = m.index + m[0].indexOf(quote);
      // Skip a match that sits inside one already found ("order 4821" contains "4821").
      if (hits.some((h) => index >= h.index && index + quote.length <= h.index + h.quote.length)) continue;
      hits.push({ quote, index, digits: spokenToDigits(quote) });
    }
  }
  const readable = hits.filter((h) => h.digits);
  const distinct = [...new Set(readable.map((h) => h.digits))];

  if (distinct.length > 1) {
    return { spoken: null, ambiguities: [`More than one order number was mentioned (${distinct.join(", ")}); not choosing one.`] };
  }
  if (distinct.length === 1) {
    return { spoken: readable.sort((a, b) => a.index - b.index)[0].quote, ambiguities: [] };
  }
  const mentioned = re(`${B}${ORDER_KEYWORD}${E}`).test(t);
  return {
    spoken: null,
    ambiguities: [mentioned ? "An order was mentioned but its number could not be read." : "No order number found in transcript."],
  };
}

// ── Time ──────────────────────────────────────────────────────────────────────────────────────────

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
function hourValue(token: string): number | null {
  const ascii = token.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  if (/^\d{1,2}$/.test(ascii)) return Number(ascii);
  return HOUR_WORDS[token.toLowerCase()] ?? null;
}

type Period = (typeof PERIOD)[string];
const periodOf = (w: string | undefined): Period | null => (w ? (PERIOD[w.toLowerCase()] ?? null) : null);
const dayOf = (w: string | undefined): number | null => (w ? (DAY[w.toLowerCase()] ?? null) : null);

/** 12-hour clock + context → 24-hour. `assumed` is set when there was no period or am/pm to go on. */
function to24(h: number, period: Period | null, ampm: string | null): { hour: number; assumed: boolean } | null {
  // 0 is never a spoken delivery hour; refusing it beats inventing noon from a stray "00".
  if (h < 1 || h > 23) return null;
  if (h > 12) return { hour: h, assumed: false };
  const a = ampm?.toLowerCase();
  if (a === "pm") return { hour: h === 12 ? 12 : h + 12, assumed: false };
  if (a === "am") return { hour: h === 12 ? 0 : h, assumed: false };
  if (period === "morning") return { hour: h === 12 ? 0 : h, assumed: false };
  if (period === "afternoon") return { hour: h < 8 ? h + 12 : h, assumed: false };
  if (period === "evening" || period === "night") return { hour: h === 12 ? (period === "night" ? 0 : 12) : h + 12, assumed: false };
  // No period: delivery hours run 08:00–22:00, so 1–7 must mean the afternoon/evening.
  return { hour: h < 8 ? h + 12 : h, assumed: true };
}

const WINDOW: Record<Period, [number, number]> = { morning: [9, 12], afternoon: [12, 16], evening: [16, 20], night: [20, 22] };

const NONE: ReasoningOutput["time"] = {
  quote: null, kind: null, dayOffset: null, weekday: null, startHour: null, startMinute: null, endHour: null, endMinute: null, confidence: null,
};

function findTime(t: string, notes: string[]): ReasoningOutput["time"] {
  const DAYP = `(?:(${DAY_WORD})\\s+)?`;
  const HALFP = `(?:(${HALF})\\s+)?`;
  const assume = (h: number, hour: number) => notes.push(`No AM/PM given for “${h}”; assumed ${String(hour).padStart(2, "0")}:00 (delivery hours).`);

  const minuteOf = (min: string | undefined, half: string | undefined) => (min ? Number(min) : half ? 30 : 0);

  // "shaam 7 se 8 ke beech", "शाम सात से आठ बजे के बीच", "शाम 07:00 से 08:00 बजे के बीच"
  let m = re(`${B}${DAYP}(?:(${PERIOD_WORD})\\s+)?${HALFP}${HOUR_MIN}\\s*(?:${BAJE}\\s*)?${TO}\\s+${HALFP}${HOUR_MIN}\\s*(?:${BAJE}\\s*)?${BETWEEN_TAIL}${E}`).exec(t);
  if (m) {
    const [, day, per, half1, h1, m1, half2, h2, m2] = m;
    const p = periodOf(per);
    const a = hourValue(h1), b = hourValue(h2);
    const s = a !== null ? to24(a, p, null) : null, e = b !== null ? to24(b, p, null) : null;
    if (s?.assumed && a !== null) assume(a, s.hour);
    return { ...NONE, quote: m[0].trim(), kind: "BETWEEN", dayOffset: dayOf(day), startHour: s?.hour ?? null, startMinute: minuteOf(m1, half1), endHour: e?.hour ?? null, endMinute: minuteOf(m2, half2) };
  }

  // "between 6 and 8 pm"
  m = re(`${B}between\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\s+(?:and|to|-)\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)${E}`).exec(t);
  if (m) {
    const [, h1, m1, ap1, h2, m2, ap2] = m;
    const s = to24(Number(h1), null, ap1 ?? ap2), e = to24(Number(h2), null, ap2);
    return { ...NONE, quote: m[0].trim(), kind: "BETWEEN", startHour: s?.hour ?? null, startMinute: m1 ? Number(m1) : 0, endHour: e?.hour ?? null, endMinute: m2 ? Number(m2) : 0 };
  }

  // "kal shaam 6 baje ke baad", "शाम छह बजे के बाद", "शाम 07:00 बजे के बाद", "6 baje se pehle", "saadhe 4 baje"
  m = re(`${B}${DAYP}(?:(${PERIOD_WORD})\\s+)?${HALFP}${HOUR_MIN}\\s*${BAJE}(?:\\s*(${AFTER}|${BEFORE}))?${E}`).exec(t);
  if (m) {
    const [, day, per, half, hTok, min, rel] = m;
    const h = hourValue(hTok);
    const r = h !== null ? to24(h, periodOf(per), null) : null;
    if (r?.assumed && h !== null) assume(h, r.hour);
    const before = rel ? re(BEFORE).test(rel) : false;
    const after = rel ? re(AFTER).test(rel) : false;
    const minute = minuteOf(min, half);
    return before
      ? { ...NONE, quote: m[0].trim(), kind: "BEFORE", dayOffset: dayOf(day), endHour: r?.hour ?? null, endMinute: minute }
      : { ...NONE, quote: m[0].trim(), kind: after ? "AFTER" : "AT", dayOffset: dayOf(day), startHour: r?.hour ?? null, startMinute: minute };
  }

  // "after 6 pm", "before 11 am tomorrow", "at 3:30 pm"
  m = re(`${B}(?:(${DAY_WORD})\\s+)?(after|before|at|by)\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)(?:\\s+(${DAY_WORD}))?${E}`).exec(t);
  if (m) {
    const [, day1, rel, hTok, min, ap, day2] = m;
    const r = to24(Number(hTok), null, ap);
    const minute = min ? Number(min) : 0;
    const dayOffset = dayOf(day1 ?? day2);
    const relL = rel.toLowerCase();
    return relL === "before" || relL === "by"
      ? { ...NONE, quote: m[0].trim(), kind: "BEFORE", dayOffset, endHour: r?.hour ?? null, endMinute: minute }
      : { ...NONE, quote: m[0].trim(), kind: relL === "after" ? "AFTER" : "AT", dayOffset, startHour: r?.hour ?? null, startMinute: minute };
  }

  // "kal subah", "परसों शाम" → that part of the day
  m = re(`${B}(${DAY_WORD})\\s+(${PERIOD_WORD})${E}`).exec(t);
  if (m) {
    const [start, end] = WINDOW[periodOf(m[2])!];
    return { ...NONE, quote: m[0].trim(), kind: "BETWEEN", dayOffset: dayOf(m[1]), startHour: start, startMinute: 0, endHour: end, endMinute: 0 };
  }

  // "Monday ko", "सोमवार को"
  m = re(`${B}(?:(?:next|agle|अगले)\\s+)?(${WEEKDAY_WORD})${E}`).exec(t);
  if (m) return { ...NONE, quote: m[0].trim(), kind: "DATE_ONLY", weekday: WEEKDAY[m[1].toLowerCase()] };

  // "kal", "parso", "कल", "tomorrow" on their own (today alone does not reschedule anything)
  m = re(`${B}(${DAY_WORD})${E}`).exec(t);
  if (m && (dayOf(m[1]) ?? 0) > 0) return { ...NONE, quote: m[0].trim(), kind: "DATE_ONLY", dayOffset: dayOf(m[1]) };

  return NONE;
}

// ── Whole report ──────────────────────────────────────────────────────────────────────────────────

export function extractWithRules(transcript: string): ReasoningOutput {
  const t = transcript;
  const ambiguities: string[] = [];

  const order = findOrderReference(t);
  ambiguities.push(...order.ambiguities);

  const issueHits = ISSUE_RULES.map((rule) => ({ rule, hit: first(t, rule.patterns) })).filter((x) => x.hit);
  if (issueHits.length > 1) {
    ambiguities.push(`Several issues mentioned: ${issueHits.map((x) => ISSUE_LABELS[x.rule.issue].toLowerCase()).join(", ")}.`);
  }
  const top = issueHits[0] ?? null;
  const neighbour = first(t, ESCALATE_PATTERNS);
  const access = first(t, ACCESS_PROBLEM_PATTERNS);
  const later = first(t, LATER_PATTERNS);
  const timeNotes: string[] = [];
  const time = findTime(t, timeNotes);
  ambiguities.push(...timeNotes);

  const instruction = issueHits.find((x) => x.rule.issue === "UNCLEAR_INSTRUCTIONS")?.hit ?? null;
  const rescheduleCue = time.quote ?? later?.quote ?? null;

  const issue: ReasoningOutput["issue"] = top
    ? { value: top.rule.issue, quote: top.hit!.quote, confidence: null }
    : access
      ? { value: "UNCLEAR_INSTRUCTIONS", quote: access.quote, confidence: null }
      : rescheduleCue
        ? { value: "RESCHEDULE_REQUEST", quote: rescheduleCue, confidence: null }
        : { value: null, quote: null, confidence: null };

  // Action precedence: refused/damaged > address > third-party handover > new instructions > new time > unavailable.
  const topIssue = top?.rule.issue;
  const action: ReasoningOutput["requestedAction"] =
    topIssue === "PACKAGE_UNDELIVERABLE" || topIssue === "WRONG_ADDRESS"
      ? { value: top!.rule.action, quote: top!.hit!.quote, confidence: null }
      : neighbour
        ? { value: "ESCALATE_TO_DISPATCHER", quote: neighbour.quote, confidence: null }
        : instruction
          ? { value: "UPDATE_INSTRUCTIONS", quote: instruction.quote, confidence: null }
          : rescheduleCue
            ? { value: "RESCHEDULE", quote: rescheduleCue, confidence: null }
            : topIssue === "CUSTOMER_UNAVAILABLE"
              ? { value: "MARK_CUSTOMER_UNAVAILABLE", quote: top!.hit!.quote, confidence: null }
              : { value: null, quote: null, confidence: null };

  if (!action.value) ambiguities.push("Could not tell what should be done.");

  return {
    orderReference: { spoken: order.spoken, confidence: null },
    issue,
    requestedAction: action,
    time,
    notes: instruction ? { value: instruction.quote, quote: instruction.quote, confidence: null } : { value: null, quote: null, confidence: null },
    ambiguities,
  };
}
