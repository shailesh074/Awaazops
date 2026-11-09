import type { EvidenceSpan, ExtractionPayload, TimeConstraint } from "@/domain";
import { reasoningOutputSchema, WEEKDAYS, type ReasoningOutput } from "./reasoning-schema";

/**
 * Deterministic normaliser: turns a reasoning provider's quotes and hints into an ExtractionPayload.
 * Pure — no I/O, no clock reads (the reference time is passed in).
 */

// ── Spoken numbers ─────────────────────────────────────────────────────────────

/** Single-digit words: Hindi (romanised, incl. spellings Prisma produced live), Devanagari, English. */
const DIGIT_WORDS: Record<string, string> = {
  // Hindi, romanised. "char auth do ek" is verbatim Prisma output for "chaar aath do ek".
  shunya: "0", sunya: "0", ek: "1", ik: "1", do: "2", teen: "3", tin: "3",
  char: "4", chaar: "4", chār: "4", paanch: "5", panch: "5", paach: "5", chhe: "6", chhah: "6", chah: "6", che: "6",
  saat: "7", sat: "7", aath: "8", ath: "8", auth: "8", aat: "8", nau: "9", nao: "9",
  // Hindi, Devanagari
  शून्य: "0", एक: "1", दो: "2", तीन: "3", चार: "4", पांच: "5", पाँच: "5", छह: "6", छः: "6", छे: "6", सात: "7", आठ: "8", नौ: "9",
  // English digits as Prisma writes them in Devanagari on hi-IN ("फोर", "एट")
  ज़ीरो: "0", जीरो: "0", वन: "1", टू: "2", थ्री: "3", फोर: "4", फ़ोर: "4", फाइव: "5", सिक्स: "6", सेवन: "7", एट: "8", नाइन: "9",
  // English
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  chhey: "6",
};
const TEENS: Record<string, string> = {
  ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15",
  sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19",
};
const TENS: Record<string, string> = {
  twenty: "2", thirty: "3", forty: "4", fifty: "5", sixty: "6", seventy: "7", eighty: "8", ninety: "9",
};
const REPEAT: Record<string, number> = { double: 2, triple: 3 };
/** Words that introduce an order number and carry no digits. */
const FILLER = new Set([
  "order", "number", "nambar", "no", "no.", "num", "id", "#", "ka", "ke", "ki", "wala", "wali", "vala", "vali", "ord",
  "ऑर्डर", "आर्डर", "ऑडर", "ओर्डर", "नंबर", "नम्बर", "नं", "नं.", "का", "के", "की", "वाला", "वाली",
]);
const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/**
 * Digits of a spoken order reference, or null if any token can't be read as part of a number.
 * Handles "4,821", "ORD-4821", "४८२१", "char auth do ek", "चार आठ दो एक", "four eight two one",
 * "forty eight twenty one", "double four". Refuses partial reads rather than guessing.
 */
export function spokenToDigits(spoken: string | null): string | null {
  if (!spoken) return null;
  const text = spoken
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .toLowerCase()
    .replace(/(\d),(?=\d{3}\b)/g, "$1") // grouped digits: 4,821 → 4821
    .replace(/[-–]/g, " ");
  const tokens = text.split(/[\s,.;:।]+/).filter(Boolean); // "।" is the Devanagari full stop

  let out = "";
  let repeat = 1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].replace(/^#/, "");
    if (!t || FILLER.has(t) || t === "ord") continue;
    if (/^ord\d+$/.test(t)) {
      out += t.slice(3);
      continue;
    }
    if (/^\d+$/.test(t)) {
      out += t.repeat(repeat);
      repeat = 1;
      continue;
    }
    if (REPEAT[t]) {
      repeat = REPEAT[t];
      continue;
    }
    if (DIGIT_WORDS[t]) {
      out += DIGIT_WORDS[t].repeat(repeat);
      repeat = 1;
      continue;
    }
    if (TEENS[t]) {
      out += TEENS[t];
      continue;
    }
    if (TENS[t]) {
      const next = tokens[i + 1];
      const unit = next && DIGIT_WORDS[next] && /^[a-z]+$/.test(next) ? DIGIT_WORDS[next] : null;
      out += TENS[t] + (unit && unit !== "0" ? unit : "0");
      if (unit && unit !== "0") i++;
      continue;
    }
    return null; // unknown word inside the reference — don't guess
  }
  return out.length >= 3 ? out : null;
}

// ── Evidence ──────────────────────────────────────────────────────────────────

/** Locate a quote in the transcript: exact first, then case-insensitive. Null if absent. */
export function locate(transcript: string, quote: string | null): EvidenceSpan | null {
  if (!quote) return null;
  let start = transcript.indexOf(quote);
  if (start < 0) start = transcript.toLowerCase().indexOf(quote.toLowerCase());
  if (start < 0) return null;
  return { quote: transcript.slice(start, start + quote.length), start, end: start + quote.length };
}

// ── Time ──────────────────────────────────────────────────────────────────────

/** The IST calendar date `days` after `referenceTime`, at hh:mm, as an ISO string with +05:30. */
export function istDateTime(referenceTime: string, days: number, hh: number, mm = 0): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(referenceTime));
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  return `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`;
}

/** 0 = today; a named weekday resolves to its next occurrence after today. */
export function dayOffsetFor(hint: Pick<ReasoningOutput["time"], "dayOffset" | "weekday">, referenceTime: string): number {
  if (hint.dayOffset !== null && hint.dayOffset >= 0 && hint.dayOffset <= 14) return hint.dayOffset;
  if (hint.weekday) {
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(referenceTime));
    const today = (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    const target = WEEKDAYS.indexOf(hint.weekday);
    return ((target - today + 7) % 7) || 7;
  }
  return 0;
}

const validHour = (h: number | null): h is number => h !== null && h >= 0 && h <= 23;
const minute = (m: number | null) => (m !== null && m >= 0 && m <= 59 ? m : 0);

/**
 * Resolve time hints to a TimeConstraint. Start/end stay null when the hints are insufficient,
 * which the validator reports as "could not resolve" instead of inventing a time.
 */
export function resolveTime(hint: ReasoningOutput["time"], referenceTime: string): TimeConstraint | null {
  if (!hint.quote || !hint.kind) return null;
  const days = dayOffsetFor(hint, referenceTime);
  const at = (h: number | null, m: number | null) => (validHour(h) ? istDateTime(referenceTime, days, h, minute(m)) : null);

  switch (hint.kind) {
    case "DATE_ONLY":
      return { kind: "DATE_ONLY", start: istDateTime(referenceTime, days, 9), end: istDateTime(referenceTime, days, 21), spoken: hint.quote };
    case "BETWEEN":
      return { kind: "BETWEEN", start: at(hint.startHour, hint.startMinute), end: at(hint.endHour, hint.endMinute), spoken: hint.quote };
    case "BEFORE":
      return { kind: "BEFORE", start: null, end: at(hint.endHour ?? hint.startHour, hint.endMinute ?? hint.startMinute), spoken: hint.quote };
    case "AFTER":
    case "AT":
      return { kind: hint.kind, start: at(hint.startHour, hint.startMinute), end: null, spoken: hint.quote };
  }
}

// ── Whole output ──────────────────────────────────────────────────────────────

export interface NormaliseResult {
  /** Candidate payload for the validator, or null when the provider output was unusable. */
  payload: ExtractionPayload | null;
  /** Why the output was unusable, for the SCHEMA_VALID check detail. */
  error: string | null;
}

export function normaliseReasoning(raw: unknown, transcript: string, referenceTime: string): NormaliseResult {
  const parsed = reasoningOutputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { payload: null, error: `${first?.path.join(".") || "root"} — ${first?.message ?? "invalid"}` };
  }
  const r = parsed.data;
  const ambiguities = [...r.ambiguities];

  const orderSpan = locate(transcript, r.orderReference.spoken);
  const digits = spokenToDigits(r.orderReference.spoken);
  if (r.orderReference.spoken && !digits) ambiguities.push(`Could not read an order number from “${r.orderReference.spoken}”.`);
  else if (r.orderReference.spoken && !orderSpan) ambiguities.push("The order number quoted by the model is not in the transcript.");

  const timeSpan = locate(transcript, r.time.quote);
  const time = resolveTime(r.time, referenceTime);

  return {
    error: null,
    payload: {
      // Unreadable or unlocatable references stay null; the validator asks the agent instead of guessing.
      orderReference: digits && orderSpan
        ? { value: digits, evidence: orderSpan, confidence: r.orderReference.confidence }
        : { value: null, evidence: null, confidence: null },
      issue: { value: r.issue.value, evidence: locate(transcript, r.issue.quote), confidence: r.issue.confidence },
      requestedAction: { value: r.requestedAction.value, evidence: locate(transcript, r.requestedAction.quote), confidence: r.requestedAction.confidence },
      timeConstraint: time && timeSpan
        ? { value: time, evidence: timeSpan, confidence: r.time.confidence }
        : { value: null, evidence: null, confidence: null },
      notes: { value: r.notes.value, evidence: locate(transcript, r.notes.quote), confidence: r.notes.confidence },
      ambiguities,
    },
  };
}
