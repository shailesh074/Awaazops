/** DEMO voice reports covering every lifecycle path: verified, clarification, rejection, failure. */
import type {
  ActionType,
  AuditEvent,
  LanguageCode,
  OrderStatus,
  Priority,
  ReportDetail,
  ReportStatus,
  ValidationCheck,
  ValidationCheckId,
  ValidationOutcome,
} from "@/domain";
import { AGENTS, ORDERS } from "./fleet";
import { buildChecks, buildPayload, ist, istOffset, simulated, type PayloadSpec } from "./build";

export interface ReportSpec {
  id: string;
  agentId: string;
  at: string;
  language: LanguageCode;
  durationMs: number;
  transcript: string | null;
  payload?: PayloadSpec;
  checks?: Partial<Record<ValidationCheckId, [ValidationCheck["status"], string?]>>;
  outcome?: ValidationOutcome;
  orderId?: string | null;
  clarification?: string | null;
  status: ReportStatus;
  priority: Priority;
  prompt?: string | null;
  failureReason?: string;
  action?: {
    type: ActionType;
    payload: Record<string, unknown>;
    orderBefore: OrderStatus;
    orderAfter: OrderStatus;
    executed: boolean;
  };
}

const addMin = (iso: string, min: number) => new Date(new Date(iso).getTime() + min * 60_000).toISOString();

export function buildReport(spec: ReportSpec): ReportDetail {
  const createdAt = ist(spec.at);
  const agent = AGENTS.find((a) => a.id === spec.agentId);
  if (!agent) throw new Error(`Demo data error: unknown agent ${spec.agentId}`);
  const order = spec.orderId ? (ORDERS.find((o) => o.id === spec.orderId) ?? null) : null;
  const failed = spec.transcript === null;

  const timings = failed
    ? [{ stage: "stt" as const, latencyMs: 2140 }]
    : [
        { stage: "stt" as const, latencyMs: 820 + (spec.durationMs % 400) },
        { stage: "reasoning" as const, latencyMs: 1310 + (spec.transcript!.length % 300) },
        { stage: "validation" as const, latencyMs: 38 },
        { stage: "tts" as const, latencyMs: 640 },
      ];

  const confirmed = spec.status === "CONFIRMED" || spec.status === "EXECUTED";

  return {
    report: {
      id: spec.id,
      agentId: spec.agentId,
      language: spec.language,
      status: spec.status,
      audioPath: null,
      audioDurationMs: spec.durationMs,
      failureReason: spec.failureReason ?? null,
      timings,
      timingSource: "illustrative",
      createdAt,
      updatedAt: confirmed ? addMin(createdAt, 1) : createdAt,
    },
    agent,
    transcript: failed
      ? null
      : {
          id: `${spec.id}-T`,
          reportId: spec.id,
          text: spec.transcript!,
          language: spec.language,
          confidence: null,
          segments: [],
          provenance: simulated("mock-stt", createdAt, timings[0].latencyMs),
        },
    extraction:
      failed || !spec.payload
        ? null
        : {
            id: `${spec.id}-X`,
            reportId: spec.id,
            payload: buildPayload(spec.transcript!, spec.payload),
            provenance: simulated("mock-llm", createdAt, timings[1].latencyMs),
          },
    validation:
      failed || !spec.outcome
        ? null
        : {
            reportId: spec.id,
            outcome: spec.outcome,
            checks: buildChecks(spec.checks),
            resolvedOrderId: spec.outcome === "VERIFIED" ? (spec.orderId ?? null) : null,
            clarificationQuestion: spec.clarification ?? null,
          },
    order,
    action:
      spec.action && confirmed && spec.orderId
        ? {
            id: `${spec.id}-A`,
            reportId: spec.id,
            orderId: spec.orderId,
            type: spec.action.type,
            payload: spec.action.payload,
            status: spec.action.executed ? "EXECUTED" : "PENDING",
            confirmedBy: spec.agentId,
            confirmedAt: addMin(createdAt, 1),
            executedAt: spec.action.executed ? addMin(createdAt, 1) : null,
          }
        : null,
    priority: spec.priority,
    confirmationPrompt: spec.prompt ?? spec.clarification ?? null,
    promptAudio: null,
  };
}

export function buildAuditTrail(spec: ReportSpec): AuditEvent[] {
  const t0 = ist(spec.at);
  const events: AuditEvent[] = [];
  const push = (e: Omit<AuditEvent, "id" | "reportId">) =>
    events.push({ ...e, reportId: spec.id, id: `${spec.id}-E${events.length + 1}` });

  push({ actorId: spec.agentId, actorRole: "AGENT", entity: "REPORT", entityId: spec.id, event: "REPORT_SUBMITTED", before: null, after: { language: spec.language }, createdAt: t0 });

  if (spec.transcript === null) {
    push({ actorId: "system", actorRole: "SYSTEM", entity: "REPORT", entityId: spec.id, event: "PIPELINE_FAILED", before: null, after: { reason: spec.failureReason }, createdAt: addMin(t0, 0) });
    return events;
  }
  if (spec.outcome) {
    push({ actorId: "system", actorRole: "SYSTEM", entity: "REPORT", entityId: spec.id, event: "VALIDATION_COMPLETED", before: null, after: { outcome: spec.outcome }, createdAt: t0 });
  }
  if (spec.status === "REJECTED") {
    push({ actorId: spec.agentId, actorRole: "AGENT", entity: "REPORT", entityId: spec.id, event: "REPORT_REJECTED", before: { status: "AWAITING_CONFIRMATION" }, after: { status: "REJECTED" }, createdAt: addMin(t0, 1) });
  }
  if ((spec.status === "CONFIRMED" || spec.status === "EXECUTED") && spec.action && spec.orderId) {
    const t1 = addMin(t0, 1);
    push({ actorId: spec.agentId, actorRole: "AGENT", entity: "REPORT", entityId: spec.id, event: "ACTION_CONFIRMED", before: { status: "AWAITING_CONFIRMATION" }, after: { status: "CONFIRMED", action: spec.action.type }, createdAt: t1 });
    if (spec.action.executed) {
      push({ actorId: "system", actorRole: "SYSTEM", entity: "ACTION", entityId: `${spec.id}-A`, event: "ACTION_EXECUTED", before: null, after: { type: spec.action.type, ...spec.action.payload }, createdAt: t1 });
      push({ actorId: "system", actorRole: "SYSTEM", entity: "ORDER", entityId: spec.orderId, event: "ORDER_UPDATED", before: { status: spec.action.orderBefore }, after: { status: spec.action.orderAfter }, createdAt: t1 });
    }
  }
  return events;
}

const T1 = "Boss, order 4821 ka customer ghar pe nahi hai. Usne bola shaam 6 baje ke baad delivery karna.";
const T2 = "Order 5307 ka address galat hai, customer bol rahi hain flat number 402 nahi, 204 hai, Sector 3 HSR.";
const T3 = "Sir 7716 wala parcel, customer phone nahi utha rahe, teen baar call kiya.";
const T4 = "Customer ne bola kal subah aana, abhi office mein hai.";
const T5 = "Order 4907 mein gate pe security allow nahi kar raha, customer bol rahe hain reception pe chhod do.";
const T6 = "6120 ka package damaged hai, box phata hua hai, customer ne lene se mana kar diya.";
const T7 = "Order 3388 ka customer available nahi, kal dopahar 2 baje try karna.";
const T8 = "Order 5590, customer out of station hai, Monday ko deliver karna.";
const T9 = "4410 customer ghar pe nahi hai, neighbour ko dene bola but unke paas ID nahi hai.";
const T10 = "Order 6655 ke address pe koi building hi nahi hai, map galat location dikha raha hai.";
const T12 = "Customer ne bola order 2290 shaam 7 se 8 ke beech laana.";

export const REPORT_SPECS: ReportSpec[] = [
  {
    id: "R-1042", agentId: "AG-101", at: "14:12", language: "hi-en", durationMs: 6400, transcript: T1,
    payload: {
      order: ["4821", "order 4821", 0.94],
      issue: ["CUSTOMER_UNAVAILABLE", "customer ghar pe nahi hai", 0.91],
      action: ["RESCHEDULE", "delivery karna", 0.82],
      time: { quote: "shaam 6 baje ke baad", kind: "AFTER", start: istOffset("18:00"), end: null, confidence: 0.88 },
    },
    outcome: "VERIFIED", orderId: "ORD-4821", status: "AWAITING_CONFIRMATION", priority: "HIGH",
    prompt: "Order 4821: customer ghar par nahi hain. Delivery aaj shaam 6 baje ke baad reschedule karun? Haan ya na boliye.",
  },
  {
    id: "R-1041", agentId: "AG-102", at: "12:40", language: "hi-en", durationMs: 7900, transcript: T2,
    payload: {
      order: ["5307", "Order 5307", 0.96],
      issue: ["WRONG_ADDRESS", "address galat hai", 0.93],
      action: ["FLAG_ADDRESS_ISSUE", "address galat hai", 0.8],
      notes: ["Correct flat number is 204, not 402 (Sector 3, HSR).", "flat number 402 nahi, 204 hai", 0.86],
    },
    outcome: "VERIFIED", orderId: "ORD-5307", status: "EXECUTED", priority: "HIGH",
    prompt: "Order 5307 ka address flat 204 update karke dispatcher ko flag karun?",
    action: { type: "FLAG_ADDRESS_ISSUE", payload: { correction: "Flat 204 (not 402)" }, orderBefore: "OUT_FOR_DELIVERY", orderAfter: "ON_HOLD", executed: true },
  },
  {
    id: "R-1040", agentId: "AG-103", at: "13:58", language: "hi-en", durationMs: 5200, transcript: T3,
    payload: {
      order: ["7716", "7716 wala parcel", 0.71],
      issue: ["CUSTOMER_UNAVAILABLE", "customer phone nahi utha rahe", 0.87],
      action: ["MARK_CUSTOMER_UNAVAILABLE", "teen baar call kiya", 0.7],
    },
    checks: {
      ORDER_EXISTS: ["FAIL", "No order 7716. Closest match on this agent's route: ORD-7761."],
      ORDER_ASSIGNED_TO_AGENT: ["SKIPPED", "Skipped — order not resolved."],
      ACTION_ALLOWED_FOR_STATUS: ["SKIPPED", "Skipped — order not resolved."],
    },
    outcome: "NEEDS_CLARIFICATION", orderId: null, status: "NEEDS_CLARIFICATION", priority: "MEDIUM",
    clarification: "Order 7716 nahi mila. Kya aap order 7761 ki baat kar rahe hain?",
  },
  {
    id: "R-1039", agentId: "AG-104", at: "13:44", language: "hi", durationMs: 4100, transcript: T4,
    payload: {
      issue: ["RESCHEDULE_REQUEST", "kal subah aana", 0.84],
      action: ["RESCHEDULE", "kal subah aana", 0.78],
      time: { quote: "kal subah", kind: "BETWEEN", start: istOffset("09:00", 1), end: istOffset("12:00", 1), confidence: 0.7 },
      ambiguities: ["No order number mentioned."],
    },
    checks: {
      REQUIRED_FIELDS_PRESENT: ["FAIL", "Order reference is missing."],
      ORDER_EXISTS: ["SKIPPED", "Skipped — no order reference."],
      ORDER_ASSIGNED_TO_AGENT: ["SKIPPED", "Skipped — no order reference."],
      ACTION_ALLOWED_FOR_STATUS: ["SKIPPED", "Skipped — no order reference."],
    },
    outcome: "NEEDS_CLARIFICATION", orderId: null, status: "NEEDS_CLARIFICATION", priority: "MEDIUM",
    clarification: "Yeh kaunse order ke baare mein hai? Order number boliye.",
  },
  {
    id: "R-1038", agentId: "AG-101", at: "13:47", language: "hi-en", durationMs: 6800, transcript: T5,
    payload: {
      order: ["4907", "Order 4907", 0.95],
      issue: ["UNCLEAR_INSTRUCTIONS", "gate pe security allow nahi kar raha", 0.83],
      action: ["UPDATE_INSTRUCTIONS", "reception pe chhod do", 0.88],
      notes: ["Leave at reception desk.", "reception pe chhod do", 0.9],
    },
    outcome: "VERIFIED", orderId: "ORD-4907", status: "EXECUTED", priority: "MEDIUM",
    prompt: "Order 4907 ke instructions update karun: reception pe chhod dena?",
    action: { type: "UPDATE_INSTRUCTIONS", payload: { instructions: "Leave at reception desk" }, orderBefore: "OUT_FOR_DELIVERY", orderAfter: "OUT_FOR_DELIVERY", executed: true },
  },
  {
    id: "R-1037", agentId: "AG-105", at: "11:55", language: "hi-en", durationMs: 5600, transcript: T6,
    payload: {
      order: ["6120", "6120 ka package", 0.9],
      issue: ["PACKAGE_UNDELIVERABLE", "package damaged hai", 0.95],
      action: ["MARK_DELIVERY_FAILED", "customer ne lene se mana kar diya", 0.89],
      notes: ["Box torn; customer refused delivery.", "box phata hua hai", 0.85],
    },
    outcome: "VERIFIED", orderId: "ORD-6120", status: "EXECUTED", priority: "CRITICAL",
    prompt: "Order 6120 ko damaged package ke kaaran failed mark karun?",
    action: { type: "MARK_DELIVERY_FAILED", payload: { reason: "Package damaged; customer refused" }, orderBefore: "OUT_FOR_DELIVERY", orderAfter: "FAILED", executed: true },
  },
  {
    id: "R-1036", agentId: "AG-106", at: "13:15", language: "hi-en", durationMs: 4900, transcript: T7,
    payload: {
      order: ["3388", "Order 3388", 0.95],
      issue: ["CUSTOMER_UNAVAILABLE", "customer available nahi", 0.9],
      action: ["RESCHEDULE", "try karna", 0.76],
      time: { quote: "kal dopahar 2 baje", kind: "AT", start: istOffset("14:00", 1), end: null, confidence: 0.86 },
    },
    checks: {
      ORDER_ASSIGNED_TO_AGENT: ["FAIL", "ORD-3388 is assigned to Sana Sheikh (AG-102), not Deepak Rawat."],
    },
    outcome: "REJECTED", orderId: "ORD-3388", status: "REJECTED", priority: "MEDIUM",
    clarification: "Order 3388 aapke route par nahi hai. Update nahi kiya gaya.",
  },
  {
    id: "R-1035", agentId: "AG-102", at: "11:36", language: "hi-en", durationMs: 4300, transcript: T8,
    payload: {
      order: ["5590", "Order 5590", 0.97],
      issue: ["RESCHEDULE_REQUEST", "customer out of station hai", 0.88],
      action: ["RESCHEDULE", "Monday ko deliver karna", 0.9],
      time: { quote: "Monday", kind: "DATE_ONLY", start: istOffset("09:00", 3), end: istOffset("21:00", 3), confidence: 0.92 },
    },
    outcome: "VERIFIED", orderId: "ORD-5590", status: "EXECUTED", priority: "MEDIUM",
    prompt: "Order 5590 ko Monday, 9 November ke liye reschedule karun?",
    action: { type: "RESCHEDULE", payload: { date: "2026-11-09" }, orderBefore: "OUT_FOR_DELIVERY", orderAfter: "RESCHEDULED", executed: true },
  },
  {
    id: "R-1034", agentId: "AG-103", at: "13:25", language: "hi-en", durationMs: 6100, transcript: T9,
    payload: {
      order: ["4410", "4410", 0.88],
      issue: ["CUSTOMER_UNAVAILABLE", "customer ghar pe nahi hai", 0.92],
      action: ["ESCALATE_TO_DISPATCHER", "neighbour ko dene bola", 0.64],
      notes: ["Customer asked to hand over to neighbour; neighbour has no ID.", "unke paas ID nahi hai", 0.81],
      ambiguities: ["Handover to a third party without ID needs dispatcher approval."],
    },
    checks: { ACTION_ALLOWED_FOR_STATUS: ["WARN", "Third-party handover requires dispatcher approval."] },
    outcome: "VERIFIED", orderId: "ORD-4410", status: "AWAITING_CONFIRMATION", priority: "HIGH",
    prompt: "Order 4410 dispatcher ko escalate karun? Neighbour ke paas ID nahi hai.",
  },
  {
    id: "R-1033", agentId: "AG-104", at: "12:08", language: "hi", durationMs: 5000, transcript: T10,
    payload: {
      order: ["6655", "Order 6655", 0.96],
      issue: ["WRONG_ADDRESS", "koi building hi nahi hai", 0.9],
      action: ["FLAG_ADDRESS_ISSUE", "map galat location dikha raha hai", 0.85],
    },
    outcome: "VERIFIED", orderId: "ORD-6655", status: "EXECUTED", priority: "HIGH",
    prompt: "Order 6655 ka address issue flag karun?",
    action: { type: "FLAG_ADDRESS_ISSUE", payload: { issue: "No building at mapped location" }, orderBefore: "OUT_FOR_DELIVERY", orderAfter: "ON_HOLD", executed: true },
  },
  {
    id: "R-1032", agentId: "AG-105", at: "12:31", language: "hi-en", durationMs: 2300, transcript: null,
    status: "FAILED", priority: "LOW",
    failureReason: "Speech-to-text returned no speech — recording was mostly traffic noise.",
  },
  {
    id: "R-1031", agentId: "AG-106", at: "10:51", language: "hi-en", durationMs: 3900, transcript: T12,
    payload: {
      order: ["2290", "order 2290", 0.95],
      issue: ["RESCHEDULE_REQUEST", "shaam 7 se 8 ke beech laana", 0.86],
      action: ["RESCHEDULE", "laana", 0.8],
      time: { quote: "shaam 7 se 8 ke beech", kind: "BETWEEN", start: istOffset("19:00"), end: istOffset("20:00"), confidence: 0.93 },
    },
    outcome: "VERIFIED", orderId: "ORD-2290", status: "EXECUTED", priority: "MEDIUM",
    prompt: "Order 2290 aaj shaam 7 se 8 ke beech reschedule karun?",
    action: { type: "RESCHEDULE", payload: { window: "19:00–20:00" }, orderBefore: "OUT_FOR_DELIVERY", orderAfter: "RESCHEDULED", executed: true },
  },
];

export const REPORTS: ReportDetail[] = REPORT_SPECS.map(buildReport);
export const AUDIT_EVENTS: AuditEvent[] = REPORT_SPECS.flatMap(buildAuditTrail).sort((a, b) =>
  b.createdAt.localeCompare(a.createdAt),
);
