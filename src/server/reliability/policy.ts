import type { ActionType, ExtractionPayload, OrderStatus } from "@/domain";

type FieldKey = "orderReference" | "requestedAction" | "timeConstraint" | "notes";

/** Fields that must be present (and grounded) before an action can be proposed. */
export const REQUIRED_FIELDS: Record<ActionType, FieldKey[]> = {
  RESCHEDULE: ["orderReference", "requestedAction", "timeConstraint"],
  MARK_CUSTOMER_UNAVAILABLE: ["orderReference", "requestedAction"],
  FLAG_ADDRESS_ISSUE: ["orderReference", "requestedAction"],
  UPDATE_INSTRUCTIONS: ["orderReference", "requestedAction", "notes"],
  MARK_DELIVERY_FAILED: ["orderReference", "requestedAction"],
  ESCALATE_TO_DISPATCHER: ["orderReference", "requestedAction"],
};

export function missingFields(payload: ExtractionPayload): FieldKey[] {
  const action = payload.requestedAction.value;
  const required: FieldKey[] = action ? REQUIRED_FIELDS[action] : ["orderReference", "requestedAction"];
  return required.filter((f) => payload[f].value === null);
}

/** Orders in a closed state accept only escalation; everything else is open to updates. */
const CLOSED: OrderStatus[] = ["DELIVERED", "FAILED"];

export function isActionAllowed(action: ActionType, status: OrderStatus): boolean {
  return action === "ESCALATE_TO_DISPATCHER" || !CLOSED.includes(status);
}

/** Delivery window the business accepts for reschedules (IST hours, inclusive start, exclusive end). */
export const DELIVERY_HOURS = { start: 8, end: 22 } as const;

/** Below this provider-reported transcript confidence we ask the agent to repeat. */
export const MIN_TRANSCRIPT_CONFIDENCE = 0.55;
