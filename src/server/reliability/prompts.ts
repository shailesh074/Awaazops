import type { ExtractionPayload, Order, OrderStatus } from "@/domain";
import { formatDateTime } from "@/lib/format";
import { ORDER_STATUS_LABELS } from "@/lib/labels";

/**
 * Text spoken back to the agent (via Timbre once integrated). Hinglish by default — the most common
 * register on the ground. Per-language variants come with Timbre voice selection (step 7).
 */
export const CLARIFY = {
  unreadable: "Maaf kijiye, report samajh nahi aayi. Kripya dobara boliye.",
  lowConfidence: "Awaaz saaf nahi aayi. Kripya dobara boliye.",
  missingOrder: "Yeh kaunse order ke baare mein hai? Order number boliye.",
  orderNotFound: (spoken: string) => `Order ${spoken} nahi mila. Kripya order number dobara boliye.`,
  orderSuggest: (spoken: string, suggestion: string) =>
    `Order ${spoken} nahi mila. Kya aap order ${suggestion} ki baat kar rahe hain?`,
  missingAction: "Is order ke liye kya karna hai? Jaise reschedule, ya customer unavailable mark karna.",
  missingTime: "Delivery kis time pe karni hai? Kripya time boliye.",
  missingNotes: "Naye instructions kya hain? Kripya boliye.",
  invalidTime: "Yeh time sahi nahi lag raha. Kripya delivery ka naya time boliye.",
  notAssigned: (spoken: string) => `Order ${spoken} aapke route par nahi hai. Yeh update nahi kiya ja sakta.`,
  notAllowed: (spoken: string, status: OrderStatus) =>
    `Order ${spoken} pehle se ${ORDER_STATUS_LABELS[status].toLowerCase()} hai. Yeh update nahi kiya ja sakta.`,
};

function timePhrase(payload: ExtractionPayload): string {
  const t = payload.timeConstraint.value;
  if (!t) return "";
  const s = t.start ? formatDateTime(t.start) : null;
  const e = t.end ? formatDateTime(t.end) : null;
  if (t.kind === "AFTER" && s) return ` ${s} ke baad`;
  if (t.kind === "BEFORE" && e) return ` ${e} se pehle`;
  if (t.kind === "AT" && s) return ` ${s} pe`;
  if (t.kind === "BETWEEN" && s && e) return ` ${s} se ${e.split(", ").at(-1)} ke beech`;
  if (t.kind === "DATE_ONLY" && s) return ` ${s.split(",")[0]} ko`;
  return "";
}

export function confirmationPrompt(payload: ExtractionPayload, order: Order): string {
  const n = order.id.replace(/\D/g, "");
  switch (payload.requestedAction.value) {
    case "RESCHEDULE":
      return `Order ${n}: delivery${timePhrase(payload)} reschedule karun? Confirm karein.`;
    case "MARK_CUSTOMER_UNAVAILABLE":
      return `Order ${n}: customer unavailable mark karun? Confirm karein.`;
    case "FLAG_ADDRESS_ISSUE":
      return `Order ${n} ka address issue dispatcher ko flag karun? Confirm karein.`;
    case "UPDATE_INSTRUCTIONS":
      return `Order ${n} ke instructions update karun: “${payload.notes.value}”? Confirm karein.`;
    case "MARK_DELIVERY_FAILED":
      return `Order ${n} ko failed delivery mark karun? Confirm karein.`;
    case "ESCALATE_TO_DISPATCHER":
      return `Order ${n} dispatcher ko escalate karun? Confirm karein.`;
    default:
      return `Order ${n} update karun? Confirm karein.`;
  }
}
