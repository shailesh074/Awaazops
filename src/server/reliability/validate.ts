import {
  extractionPayloadSchema,
  type ExtractionPayload,
  type LanguageCode,
  type Order,
  type ValidationCheck,
  type ValidationCheckId,
  type ValidationOutcome,
} from "@/domain";
import { CHECK_LABELS } from "@/lib/labels";
import { canonicalOrderId, orderDigits, suggestOrder } from "./order-reference";
import { DELIVERY_HOURS, MIN_TRANSCRIPT_CONFIDENCE, isActionAllowed, missingFields } from "./policy";
import { PROMPTS, confirmationPrompt } from "./prompts";

export interface ValidateInput {
  /** Raw, untrusted reasoning output. */
  raw: unknown;
  transcript: string;
  transcriptConfidence: number | null;
  agentId: string;
  /** "Now" for time checks (ISO). */
  referenceTime: string;
  /** Order snapshot to verify against (the database). */
  orders: Order[];
  /** Fields the agent typed in an edit: grounded in the agent's explicit input, not the transcript. */
  agentProvided?: EvidenceField[];
  /** Why upstream normalisation rejected the provider output (raw is then null). */
  rawError?: string | null;
  /** Language for agent-facing prompts. */
  language?: LanguageCode;
}

export interface ValidateOutput {
  /** Schema-valid payload with ungrounded values removed; null if the output was unusable. */
  payload: ExtractionPayload | null;
  outcome: ValidationOutcome;
  checks: ValidationCheck[];
  resolvedOrder: Order | null;
  /** Clarification / refusal text for the agent, or the confirmation prompt when VERIFIED. */
  prompt: string;
}

const EVIDENCE_FIELDS = ["orderReference", "issue", "requestedAction", "timeConstraint", "notes"] as const;
type EvidenceField = (typeof EVIDENCE_FIELDS)[number];

/**
 * Re-checks every evidence span against the transcript. Values whose quote cannot be found are removed
 * ("unverified" is treated as "not said"); spans whose quote exists elsewhere get their offsets repaired.
 */
export function groundEvidence(payload: ExtractionPayload, transcript: string, exempt: EvidenceField[] = []) {
  const next = structuredClone(payload);
  const dropped: EvidenceField[] = [];
  const repaired: EvidenceField[] = [];
  for (const key of EVIDENCE_FIELDS) {
    if (exempt.includes(key)) continue;
    const field = next[key] as { value: unknown; evidence: { quote: string; start: number; end: number } | null; confidence: number };
    if (field.value === null) continue;
    const ev = field.evidence;
    if (ev && transcript.slice(ev.start, ev.end) === ev.quote) continue;
    const at = ev ? transcript.indexOf(ev.quote) : -1;
    if (ev && at >= 0) {
      field.evidence = { quote: ev.quote, start: at, end: at + ev.quote.length };
      repaired.push(key);
    } else {
      field.value = null;
      field.evidence = null;
      field.confidence = 0;
      dropped.push(key);
    }
  }
  return { payload: next, dropped, repaired };
}

function istHour(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date(iso)),
  );
}

/**
 * The Intelligence Reliability Engine's verification pass. Deterministic and side-effect free:
 * the LLM proposes, this decides.
 */
export function validateExtraction(input: ValidateInput): ValidateOutput {
  const language = input.language ?? "hi-en";
  const CLARIFY = PROMPTS[language];
  const status = new Map<ValidationCheckId, [ValidationCheck["status"], string]>();
  const set = (id: ValidationCheckId, s: ValidationCheck["status"], detail: string) => status.set(id, [s, detail]);
  const finish = (outcome: ValidationOutcome, payload: ExtractionPayload | null, order: Order | null, prompt: string): ValidateOutput => ({
    payload,
    outcome,
    resolvedOrder: outcome === "VERIFIED" ? order : null,
    prompt,
    checks: (Object.keys(CHECK_LABELS) as ValidationCheckId[]).map((id) => {
      const [s, detail] = status.get(id) ?? ["SKIPPED", "Not reached."];
      return { id, status: s, detail };
    }),
  });

  // 1. Transcript confidence (only when the provider reports one — never invented).
  const conf = input.transcriptConfidence;
  if (conf === null) set("TRANSCRIPT_CONFIDENCE", "SKIPPED", "Provider did not report confidence.");
  else if (conf < MIN_TRANSCRIPT_CONFIDENCE) {
    set("TRANSCRIPT_CONFIDENCE", "FAIL", `Confidence ${Math.round(conf * 100)}% is below ${Math.round(MIN_TRANSCRIPT_CONFIDENCE * 100)}%.`);
    return finish("NEEDS_CLARIFICATION", null, null, CLARIFY.lowConfidence);
  } else set("TRANSCRIPT_CONFIDENCE", "PASS", `Confidence ${Math.round(conf * 100)}%.`);

  // 2. Schema.
  const parsed = extractionPayloadSchema.safeParse(input.raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const why = input.rawError ?? `${first?.path.join(".") || "root"} — ${first?.message ?? "invalid"}`;
    set("SCHEMA_VALID", "FAIL", `Output rejected: ${why}.`);
    return finish("NEEDS_CLARIFICATION", null, null, CLARIFY.unreadable);
  }
  set("SCHEMA_VALID", "PASS", "Structured output matches the extraction schema.");

  // 3. Evidence grounding.
  const exempt = input.agentProvided ?? [];
  const { payload, dropped, repaired } = groundEvidence(parsed.data, input.transcript, exempt);
  const editedNote = exempt.length ? ` Agent-edited: ${exempt.join(", ")}.` : "";
  if (dropped.length) set("EVIDENCE_GROUNDED", "WARN", `Discarded values not found in the transcript: ${dropped.join(", ")}.${editedNote}`);
  else if (exempt.length) set("EVIDENCE_GROUNDED", "PASS", `Remaining values quote the transcript.${editedNote}`);
  else if (repaired.length) set("EVIDENCE_GROUNDED", "PASS", `All values grounded (offsets corrected for ${repaired.join(", ")}).`);
  else set("EVIDENCE_GROUNDED", "PASS", "Every extracted value quotes the transcript.");

  // 4. Required fields.
  const missing = missingFields(payload);
  if (missing.length) {
    set("REQUIRED_FIELDS_PRESENT", "FAIL", `Missing: ${missing.join(", ")}.`);
  } else set("REQUIRED_FIELDS_PRESENT", "PASS", "All fields required for this action are present.");

  // 5. Order exists (verified against the database, never the model).
  const spoken = payload.orderReference.value;
  const digits = orderDigits(spoken);
  let order: Order | null = null;
  let suggestion: Order | null = null;
  if (spoken === null) {
    set("ORDER_EXISTS", "SKIPPED", "No order reference to look up.");
  } else if (!digits) {
    set("ORDER_EXISTS", "FAIL", `Could not read an order number from “${spoken}”.`);
  } else {
    order = input.orders.find((o) => o.id === canonicalOrderId(digits)) ?? null;
    if (order) set("ORDER_EXISTS", "PASS", `${order.id} found.`);
    else {
      suggestion = suggestOrder(digits, input.orders.filter((o) => o.assignedAgentId === input.agentId));
      set(
        "ORDER_EXISTS",
        "FAIL",
        `No order ${digits}.` + (suggestion ? ` Closest on this agent's route: ${suggestion.id}.` : ""),
      );
    }
  }

  // 6. Assignment and 7. status policy — only meaningful for a resolved order.
  let refused = false;
  if (order) {
    if (order.assignedAgentId !== input.agentId) {
      set("ORDER_ASSIGNED_TO_AGENT", "FAIL", `${order.id} is not on this agent's route.`);
      refused = true;
    } else set("ORDER_ASSIGNED_TO_AGENT", "PASS", `${order.id} is on this agent's route.`);

    const action = payload.requestedAction.value;
    if (action && !isActionAllowed(action, order.status)) {
      set("ACTION_ALLOWED_FOR_STATUS", "FAIL", `${order.id} is ${order.status}; only escalation is allowed.`);
      refused = true;
    } else if (action) set("ACTION_ALLOWED_FOR_STATUS", "PASS", `Allowed for status ${order.status}.`);
  } else {
    set("ORDER_ASSIGNED_TO_AGENT", "SKIPPED", "Skipped — order not resolved.");
    set("ACTION_ALLOWED_FOR_STATUS", "SKIPPED", "Skipped — order not resolved.");
  }

  // 8. Time constraint.
  const t = payload.timeConstraint.value;
  let badTime = false;
  if (!t) set("TIME_CONSTRAINT_VALID", "SKIPPED", "No time constraint.");
  else {
    const latest = t.end ?? t.start;
    if (!latest) {
      set("TIME_CONSTRAINT_VALID", "FAIL", `Could not resolve “${t.spoken}” to a time.`);
      badTime = true;
    } else if (new Date(latest).getTime() <= new Date(input.referenceTime).getTime()) {
      set("TIME_CONSTRAINT_VALID", "FAIL", `“${t.spoken}” is already in the past.`);
      badTime = true;
    } else if (t.kind !== "DATE_ONLY" && t.start && (istHour(t.start) < DELIVERY_HOURS.start || istHour(t.start) >= DELIVERY_HOURS.end)) {
      set("TIME_CONSTRAINT_VALID", "FAIL", `“${t.spoken}” is outside delivery hours (${DELIVERY_HOURS.start}:00–${DELIVERY_HOURS.end}:00).`);
      badTime = true;
    } else set("TIME_CONSTRAINT_VALID", "PASS", "Requested time is in the future and within delivery hours.");
  }

  const say = digits ?? spoken ?? "";
  if (refused && order) {
    const prompt = status.get("ORDER_ASSIGNED_TO_AGENT")?.[0] === "FAIL" ? CLARIFY.notAssigned(say) : CLARIFY.notAllowed(say, order.status);
    return finish("REJECTED", payload, order, prompt);
  }

  // Clarification, most fundamental gap first.
  if (spoken === null) return finish("NEEDS_CLARIFICATION", payload, null, CLARIFY.missingOrder);
  if (!order) {
    const prompt = !digits
      ? CLARIFY.missingOrder
      : suggestion
        ? CLARIFY.orderSuggest(digits, suggestion.id.replace(/\D/g, ""))
        : CLARIFY.orderNotFound(digits);
    return finish("NEEDS_CLARIFICATION", payload, null, prompt);
  }
  if (missing.includes("requestedAction")) return finish("NEEDS_CLARIFICATION", payload, null, CLARIFY.missingAction);
  if (missing.includes("timeConstraint")) return finish("NEEDS_CLARIFICATION", payload, null, CLARIFY.missingTime);
  if (missing.includes("notes")) return finish("NEEDS_CLARIFICATION", payload, null, CLARIFY.missingNotes);
  if (badTime) return finish("NEEDS_CLARIFICATION", payload, null, CLARIFY.invalidTime);

  return finish("VERIFIED", payload, order, confirmationPrompt(payload, order, language));
}
