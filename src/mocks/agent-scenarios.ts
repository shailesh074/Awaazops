/**
 * DEMO scenarios for the Agent Portal while real providers are not connected.
 * Each one is a scripted pipeline outcome for agent AG-101 — not a model output.
 */
import type { ReportDetail } from "@/domain";
import { istOffset } from "./build";
import { buildReport } from "./reports";

export interface AgentScenario {
  id: string;
  label: string;
  hint: string;
  build: () => ReportDetail;
}

export const AGENT_SCENARIOS: AgentScenario[] = [
  {
    id: "reschedule",
    label: "Customer unavailable, reschedule",
    hint: "Verified path → confirmation",
    build: () =>
      buildReport({
        id: "R-DEMO-1", agentId: "AG-101", at: "14:20", language: "hi-en", durationMs: 6400,
        transcript: "Boss, order 4821 ka customer ghar pe nahi hai. Usne bola shaam 6 baje ke baad delivery karna.",
        payload: {
          order: ["4821", "order 4821", 0.94],
          issue: ["CUSTOMER_UNAVAILABLE", "customer ghar pe nahi hai", 0.91],
          action: ["RESCHEDULE", "delivery karna", 0.82],
          time: { quote: "shaam 6 baje ke baad", kind: "AFTER", start: istOffset("18:00"), end: null, confidence: 0.88 },
        },
        outcome: "VERIFIED", orderId: "ORD-4821", status: "AWAITING_CONFIRMATION", priority: "HIGH",
        prompt: "Order 4821: customer ghar par nahi hain. Delivery aaj shaam 6 baje ke baad reschedule karun? Haan ya na boliye.",
      }),
  },
  {
    id: "instructions",
    label: "New gate instructions",
    hint: "Verified path → confirmation",
    build: () =>
      buildReport({
        id: "R-DEMO-2", agentId: "AG-101", at: "14:22", language: "hi-en", durationMs: 5100,
        transcript: "Order 4952 ka customer bol raha hai gate number 2 se aana, main gate band hai.",
        payload: {
          order: ["4952", "Order 4952", 0.96],
          issue: ["UNCLEAR_INSTRUCTIONS", "main gate band hai", 0.84],
          action: ["UPDATE_INSTRUCTIONS", "gate number 2 se aana", 0.89],
          notes: ["Use gate 2; main gate closed.", "gate number 2 se aana", 0.9],
        },
        outcome: "VERIFIED", orderId: "ORD-4952", status: "AWAITING_CONFIRMATION", priority: "MEDIUM",
        prompt: "Order 4952 ke instructions update karun: gate number 2 se aana hai?",
      }),
  },
  {
    id: "unknown-order",
    label: "Order number not found",
    hint: "Database check fails → clarification",
    build: () =>
      buildReport({
        id: "R-DEMO-3", agentId: "AG-101", at: "14:24", language: "hi-en", durationMs: 3800,
        transcript: "Boss 9134 wala order, customer ghar pe nahi hai.",
        payload: {
          order: ["9134", "9134 wala order", 0.74],
          issue: ["CUSTOMER_UNAVAILABLE", "customer ghar pe nahi hai", 0.9],
          action: ["MARK_CUSTOMER_UNAVAILABLE", "customer ghar pe nahi hai", 0.72],
        },
        checks: {
          ORDER_EXISTS: ["FAIL", "No order 9134 in the database or on your route."],
          ORDER_ASSIGNED_TO_AGENT: ["SKIPPED", "Skipped — order not resolved."],
          ACTION_ALLOWED_FOR_STATUS: ["SKIPPED", "Skipped — order not resolved."],
        },
        outcome: "NEEDS_CLARIFICATION", orderId: null, status: "NEEDS_CLARIFICATION", priority: "MEDIUM",
        clarification: "Order 9134 nahi mila. Kripya order number dobara boliye.",
      }),
  },
  {
    id: "missing-order",
    label: "No order number spoken",
    hint: "Missing field → clarification",
    build: () =>
      buildReport({
        id: "R-DEMO-4", agentId: "AG-101", at: "14:26", language: "hi", durationMs: 3200,
        transcript: "Customer ne bola kal aana, abhi bahar hai.",
        payload: {
          issue: ["RESCHEDULE_REQUEST", "kal aana", 0.83],
          action: ["RESCHEDULE", "kal aana", 0.77],
          time: { quote: "kal", kind: "DATE_ONLY", start: istOffset("09:00", 1), end: istOffset("21:00", 1), confidence: 0.75 },
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
      }),
  },
  {
    id: "not-my-order",
    label: "Order on another agent's route",
    hint: "Assignment check fails → blocked",
    build: () =>
      buildReport({
        id: "R-DEMO-5", agentId: "AG-101", at: "14:28", language: "hi-en", durationMs: 4000,
        transcript: "Order 3388 ka customer available nahi hai, kal try karna.",
        payload: {
          order: ["3388", "Order 3388", 0.95],
          issue: ["CUSTOMER_UNAVAILABLE", "customer available nahi hai", 0.9],
          action: ["RESCHEDULE", "kal try karna", 0.78],
          time: { quote: "kal", kind: "DATE_ONLY", start: istOffset("09:00", 1), end: istOffset("21:00", 1), confidence: 0.74 },
        },
        checks: { ORDER_ASSIGNED_TO_AGENT: ["FAIL", "ORD-3388 is assigned to Sana Sheikh (AG-102), not you."] },
        outcome: "REJECTED", orderId: "ORD-3388", status: "REJECTED", priority: "MEDIUM",
        clarification: "Order 3388 aapke route par nahi hai. Yeh update nahi kiya ja sakta.",
      }),
  },
];
