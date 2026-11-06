import type { ActionType, ExtractionPayload, Order } from "@/domain";

const TWO_HOURS = 2 * 60 * 60 * 1000;

export interface AppliedAction {
  order: Order;
  /** Payload recorded on the operational action (what was actually changed). */
  actionPayload: Record<string, unknown>;
}

/**
 * Pure state change for a confirmed action. Callers must only invoke this for CONFIRMED reports;
 * the lifecycle (report-lifecycle.ts) enforces that.
 */
export function applyAction(order: Order, action: ActionType, payload: ExtractionPayload, nowIso: string): AppliedAction {
  const next: Order = { ...order, updatedAt: nowIso };
  const notes = payload.notes.value;

  switch (action) {
    case "RESCHEDULE": {
      const t = payload.timeConstraint.value;
      next.status = "RESCHEDULED";
      if (t?.start) {
        const start = new Date(t.start);
        const end = t.end ? new Date(t.end) : new Date(start.getTime() + TWO_HOURS);
        next.slotStart = start.toISOString();
        next.slotEnd = end.toISOString();
      }
      return { order: next, actionPayload: { slotStart: next.slotStart, slotEnd: next.slotEnd, spoken: t?.spoken ?? null } };
    }
    case "MARK_CUSTOMER_UNAVAILABLE":
      next.status = "ATTEMPTED";
      return { order: next, actionPayload: { reason: "Customer unavailable" } };
    case "FLAG_ADDRESS_ISSUE":
      next.status = "ON_HOLD";
      if (notes) next.instructions = notes;
      return { order: next, actionPayload: { note: notes } };
    case "UPDATE_INSTRUCTIONS":
      next.instructions = notes;
      return { order: next, actionPayload: { instructions: notes } };
    case "MARK_DELIVERY_FAILED":
      next.status = "FAILED";
      return { order: next, actionPayload: { reason: notes ?? "Delivery failed" } };
    case "ESCALATE_TO_DISPATCHER":
      next.status = "ON_HOLD";
      return { order: next, actionPayload: { note: notes, escalated: true } };
  }
}
