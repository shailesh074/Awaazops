import "server-only";
import type { ReasoningInput, ReasoningProvider, ReasoningResult } from "./types";

/**
 * SIMULATED reasoning: transparent keyword rules, not a model. It emits the same raw shape the real
 * LLM will, so its output goes through exactly the same validation. Always marked simulated.
 */
type Span = { quote: string; start: number; end: number };

function find(text: string, re: RegExp): (Span & { m: RegExpExecArray }) | null {
  const m = re.exec(text);
  return m ? { quote: m[0], start: m.index, end: m.index + m[0].length, m } : null;
}

const strip = (s: (Span & { m: RegExpExecArray }) | null): Span | null =>
  s ? { quote: s.quote, start: s.start, end: s.end } : null;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** IST calendar date of `ref` shifted by `days`, at hh:mm, as an offset ISO string. */
function istAt(ref: string, days: number, hh: number, mm = 0): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ref));
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  return `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`;
}

function to24(period: string | undefined, h: number): number {
  const p = period?.toLowerCase();
  if ((p === "shaam" || p === "raat") && h < 12) return h + 12;
  if (p === "dopahar" && h < 8) return h + 12;
  return h;
}

function resolveTime(text: string, ref: string) {
  const dayOffset = (s: string | undefined) => (s?.toLowerCase().startsWith("kal") ? 1 : 0);

  const between = find(text, /(kal\s+|aaj\s+)?(subah|dopahar|shaam|raat)?\s*(\d{1,2})\s*se\s*(\d{1,2})\s*(?:baje\s*)?ke\s*beech/i);
  if (between) {
    const [, day, period, a, b] = between.m;
    const off = dayOffset(day);
    return { span: strip(between), value: { kind: "BETWEEN", start: istAt(ref, off, to24(period, +a)), end: istAt(ref, off, to24(period, +b)), spoken: between.quote } };
  }
  const at = find(text, /(kal\s+|aaj\s+)?(subah|dopahar|shaam|raat)\s*(\d{1,2})\s*baje(\s*ke\s*baad)?/i);
  if (at) {
    const [, day, period, h, after] = at.m;
    return { span: strip(at), value: { kind: after ? "AFTER" : "AT", start: istAt(ref, dayOffset(day), to24(period, +h)), end: null, spoken: at.quote } };
  }
  const kalSubah = find(text, /kal\s+subah/i);
  if (kalSubah) return { span: strip(kalSubah), value: { kind: "BETWEEN", start: istAt(ref, 1, 9), end: istAt(ref, 1, 12), spoken: kalSubah.quote } };

  const weekday = find(text, new RegExp(`\\b(${WEEKDAYS.join("|")})\\b`, "i"));
  if (weekday) {
    const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ref))).getUTCDay();
    const target = WEEKDAYS.indexOf(weekday.m[1].toLowerCase());
    const off = ((target - today + 7) % 7) || 7;
    return { span: strip(weekday), value: { kind: "DATE_ONLY", start: istAt(ref, off, 9), end: istAt(ref, off, 21), spoken: weekday.quote } };
  }
  const kal = find(text, /\bkal\b/i);
  if (kal) return { span: strip(kal), value: { kind: "DATE_ONLY", start: istAt(ref, 1, 9), end: istAt(ref, 1, 21), spoken: kal.quote } };
  return null;
}

export class MockReasoningProvider implements ReasoningProvider {
  readonly id = "mock-llm" as const;

  isConfigured(): boolean {
    return true;
  }

  async extract({ transcript: t, referenceTime }: ReasoningInput): Promise<ReasoningResult> {
    const started = performance.now();

    const order =
      find(t, /order\s*(?:no\.?|number)?\s*#?\s*\d{3,}/i) ?? find(t, /\b\d{4,}\b(?=\s*(?:ka|ke|ki|wala|wali|,|$))/i);
    const orderDigits = order?.quote.match(/\d{3,}/)?.[0] ?? null;

    const unavailable = find(t, /ghar pe nahi|not at home|available nahi|phone nahi utha\w*|bahar gaye/i);
    const address = find(t, /address\s*(?:galat|is wrong)|building hi nahi|galat location/i);
    const damaged = find(t, /damaged|phata hua|refuse\w*|lene se mana/i);
    const instruction = find(t, /reception pe chhod do|leave it at reception|gate number \d+ se aana/i);
    const neighbour = find(t, /neighbou?r/i);
    const time = resolveTime(t, referenceTime);

    const issue = damaged
      ? { value: "PACKAGE_UNDELIVERABLE", evidence: strip(damaged) }
      : address
        ? { value: "WRONG_ADDRESS", evidence: strip(address) }
        : unavailable
          ? { value: "CUSTOMER_UNAVAILABLE", evidence: strip(unavailable) }
          : instruction
            ? { value: "UNCLEAR_INSTRUCTIONS", evidence: strip(instruction) }
            : time
              ? { value: "RESCHEDULE_REQUEST", evidence: time.span }
              : { value: null, evidence: null };

    const action = damaged
      ? { value: "MARK_DELIVERY_FAILED", evidence: strip(damaged) }
      : address
        ? { value: "FLAG_ADDRESS_ISSUE", evidence: strip(address) }
        : neighbour
          ? { value: "ESCALATE_TO_DISPATCHER", evidence: strip(neighbour) }
          : instruction
            ? { value: "UPDATE_INSTRUCTIONS", evidence: strip(instruction) }
            : time
              ? { value: "RESCHEDULE", evidence: time.span }
              : unavailable
                ? { value: "MARK_CUSTOMER_UNAVAILABLE", evidence: strip(unavailable) }
                : { value: null, evidence: null };

    const ambiguities: string[] = [];
    if (!order) ambiguities.push("No order number found in transcript.");
    if (!action.value) ambiguities.push("Could not tell what should be done.");

    const raw = {
      orderReference: { value: orderDigits, evidence: strip(order), confidence: order ? 0.9 : 0 },
      issue: { ...issue, confidence: issue.value ? 0.8 : 0 },
      requestedAction: { ...action, confidence: action.value ? 0.75 : 0 },
      timeConstraint: time
        ? { value: time.value, evidence: time.span, confidence: 0.8 }
        : { value: null, evidence: null, confidence: 0 },
      notes: instruction
        ? { value: instruction.quote, evidence: strip(instruction), confidence: 0.85 }
        : { value: null, evidence: null, confidence: 0 },
      ambiguities,
    };

    return {
      raw,
      provenance: {
        provider: this.id,
        simulated: true,
        latencyMs: Math.round(performance.now() - started),
        createdAt: new Date().toISOString(),
      },
    };
  }
}
