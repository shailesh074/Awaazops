"use client";

import { ChevronRight, MapPin, Package } from "lucide-react";
import { OrderStatusPill } from "@/components/shared/status-pill";
import { formatSlot } from "@/lib/format";
import type { Order } from "@/domain";

/**
 * The agent's open orders. Read-only on the compose screen ("which orders am I carrying?"); with `onPick`
 * each row becomes a button that corrects the report's order reference — which is then re-verified.
 */
export function RouteOrders({
  orders,
  title = "Your route",
  description = "Open orders assigned to you. Say the order number in your report.",
  onPick,
  disabled,
}: {
  orders: Order[];
  title?: string;
  description?: string;
  onPick?: (order: Order) => void;
  disabled?: boolean;
}) {
  if (orders.length === 0) return null;
  return (
    <section className="rounded-2xl border bg-surface p-4" aria-label={title}>
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mb-3 text-xs text-pretty text-muted-foreground">{description}</p>
      <ul className="space-y-2">
        {orders.map((o) => {
          const body = (
            <>
              <span className="min-w-0 flex-1 space-y-0.5 text-left">
                <span className="flex items-center gap-1.5 font-mono text-sm">
                  <Package className="size-3.5 text-muted-foreground" /> {o.id}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {o.customerName} · <MapPin className="inline size-3" /> {o.locality} · {formatSlot(o.slotStart, o.slotEnd)}
                </span>
              </span>
              <OrderStatusPill status={o.status} />
              {onPick ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" /> : null}
            </>
          );
          return (
            <li key={o.id}>
              {onPick ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(o)}
                  className="flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-primary/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
