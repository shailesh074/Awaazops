/**
 * Helpers for constructing internally consistent DEMO data.
 * Evidence offsets are computed from the transcript text, so a highlight can never point at the wrong words.
 * Everything built here is marked `simulated: true`.
 */
import type {
  ActionType,
  EvidenceSpan,
  ExtractionPayload,
  IssueType,
  Provenance,
  TimeConstraint,
  ValidationCheck,
  ValidationCheckId,
} from "@/domain";
import { VALIDATION_CHECKS } from "@/domain";

export const DEMO_DATE = "2026-11-06";

/** "14:05" (IST, demo day) → UTC ISO string. Optional day offset for future dates. */
export function ist(hhmm: string, dayOffset = 0): string {
  const d = new Date(`${DEMO_DATE}T${hhmm}:00+05:30`);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString();
}

/** IST ISO with explicit offset, as the normaliser will emit for time constraints. */
export function istOffset(hhmm: string, dayOffset = 0): string {
  const [y, m, d] = DEMO_DATE.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + dayOffset));
  const ymd = date.toISOString().slice(0, 10);
  return `${ymd}T${hhmm}:00+05:30`;
}

export function span(transcript: string, quote: string): EvidenceSpan {
  const start = transcript.indexOf(quote);
  if (start < 0) throw new Error(`Demo data error: "${quote}" not found in transcript "${transcript}"`);
  return { quote, start, end: start + quote.length };
}

export function simulated(provider: Provenance["provider"], createdAt: string, latencyMs = 0): Provenance {
  return { provider, simulated: true, latencyMs, createdAt };
}

type Field<T> = [value: T, quote: string, confidence: number] | null;

export interface PayloadSpec {
  order?: Field<string>;
  issue?: Field<IssueType>;
  action?: Field<ActionType>;
  time?: { quote: string; kind: TimeConstraint["kind"]; start: string | null; end: string | null; confidence: number } | null;
  notes?: Field<string>;
  ambiguities?: string[];
}

export function buildPayload(transcript: string, spec: PayloadSpec): ExtractionPayload {
  const field = <T,>(f: Field<T> | undefined) =>
    f
      ? { value: f[0], evidence: span(transcript, f[1]), confidence: f[2] }
      : { value: null, evidence: null, confidence: 0 };

  return {
    orderReference: field(spec.order),
    issue: field(spec.issue),
    requestedAction: field(spec.action),
    timeConstraint: spec.time
      ? {
          value: { kind: spec.time.kind, start: spec.time.start, end: spec.time.end, spoken: spec.time.quote },
          evidence: span(transcript, spec.time.quote),
          confidence: spec.time.confidence,
        }
      : { value: null, evidence: null, confidence: 0 },
    notes: field(spec.notes),
    ambiguities: spec.ambiguities ?? [],
  };
}

const DEFAULT_DETAIL: Record<ValidationCheckId, string> = {
  SCHEMA_VALID: "Structured output parsed against the extraction schema.",
  EVIDENCE_GROUNDED: "Each extracted value quotes the transcript.",
  ORDER_EXISTS: "Order found in the order database.",
  ORDER_ASSIGNED_TO_AGENT: "Order is on this agent's route.",
  ACTION_ALLOWED_FOR_STATUS: "Requested action is permitted for the current order status.",
  REQUIRED_FIELDS_PRESENT: "All fields required for this action are present.",
  TIME_CONSTRAINT_VALID: "Requested time is in the future and within delivery hours.",
  TRANSCRIPT_CONFIDENCE: "Provider did not report confidence (simulated transcript).",
};

/** All checks default to PASS (confidence defaults to SKIPPED); override the ones that differ. */
export function buildChecks(
  overrides: Partial<Record<ValidationCheckId, [ValidationCheck["status"], string?]>> = {},
): ValidationCheck[] {
  return VALIDATION_CHECKS.map((id) => {
    const o = overrides[id];
    const status = o?.[0] ?? (id === "TRANSCRIPT_CONFIDENCE" ? "SKIPPED" : "PASS");
    return { id, status, detail: o?.[1] ?? DEFAULT_DETAIL[id] };
  });
}
