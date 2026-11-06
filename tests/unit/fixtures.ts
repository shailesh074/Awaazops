import type { ExtractionPayload, Order } from "@/domain";

export const NOW = "2026-11-06T08:30:00.000Z"; // 14:00 IST

export function order(id: string, overrides: Partial<Order> = {}): Order {
  return {
    id,
    customerName: "Test Customer",
    customerPhoneMasked: "+91 •••••• 0000",
    addressLine: "1 Test Road",
    locality: "Koramangala",
    city: "Bengaluru",
    pincode: "560095",
    status: "OUT_FOR_DELIVERY",
    priority: "MEDIUM",
    assignedAgentId: "AG-1",
    slotStart: "2026-11-06T07:30:00.000Z",
    slotEnd: "2026-11-06T09:30:00.000Z",
    instructions: null,
    updatedAt: NOW,
    ...overrides,
  };
}

export const ORDERS: Order[] = [
  order("ORD-4821"),
  order("ORD-7761"),
  order("ORD-3388", { assignedAgentId: "AG-2" }),
  order("ORD-4935", { status: "DELIVERED" }),
];

export const TRANSCRIPT =
  "Boss, order 4821 ka customer ghar pe nahi hai. Usne bola shaam 6 baje ke baad delivery karna.";

const at = (quote: string) => {
  const start = TRANSCRIPT.indexOf(quote);
  if (start < 0) throw new Error(`fixture quote missing: ${quote}`);
  return { quote, start, end: start + quote.length };
};

/** A well-formed reschedule extraction for TRANSCRIPT. */
export function payload(overrides: Partial<ExtractionPayload> = {}): ExtractionPayload {
  return {
    orderReference: { value: "4821", evidence: at("order 4821"), confidence: 0.9 },
    issue: { value: "CUSTOMER_UNAVAILABLE", evidence: at("customer ghar pe nahi hai"), confidence: 0.9 },
    requestedAction: { value: "RESCHEDULE", evidence: at("delivery karna"), confidence: 0.8 },
    timeConstraint: {
      value: { kind: "AFTER", start: "2026-11-06T18:00:00+05:30", end: null, spoken: "shaam 6 baje ke baad" },
      evidence: at("shaam 6 baje ke baad"),
      confidence: 0.8,
    },
    notes: { value: null, evidence: null, confidence: 0 },
    ambiguities: [],
    ...overrides,
  };
}
