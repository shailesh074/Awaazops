import type { Order } from "@/domain";

/**
 * Digits of a spoken/extracted order reference: "4821", "ORD-4821", "#4821", "order 4821" → "4821".
 * Returns null when there are no digits. Spoken number words ("chaar aath do ek") are handled by the
 * normaliser (step 6), not here.
 */
export function orderDigits(reference: string | null): string | null {
  if (!reference) return null;
  const digits = reference.replace(/\D/g, "");
  return digits.length >= 3 ? digits : null;
}

export function canonicalOrderId(digits: string): string {
  return `ORD-${digits}`;
}

/** True when a and b differ by exactly one substituted digit or one adjacent transposition. */
export function isNearMiss(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  const diff: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
  if (diff.length === 1) return true;
  if (diff.length === 2 && diff[1] === diff[0] + 1) {
    const [i, j] = diff;
    return a[i] === b[j] && a[j] === b[i];
  }
  return false;
}

/**
 * When a spoken order is not found, suggest the single near-miss on the agent's own route.
 * Ambiguous (several near-misses) → no suggestion, so we never guess between candidates.
 */
export function suggestOrder(digits: string, agentOrders: Order[]): Order | null {
  const near = agentOrders.filter((o) => isNearMiss(digits, o.id.replace(/\D/g, "")));
  return near.length === 1 ? near[0] : null;
}
