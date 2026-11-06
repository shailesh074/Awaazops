"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OrderStatusPill, PriorityPill } from "@/components/shared/status-pill";
import { ORDER_STATUSES, type Agent, type Order, type OrderStatus } from "@/domain";
import { ORDER_STATUS_LABELS } from "@/lib/labels";
import { formatSlot } from "@/lib/format";

export function OrdersTable({
  orders,
  agents,
  reportsByOrder,
}: {
  orders: Order[];
  agents: Agent[];
  /** Order ID → report IDs linked to it. */
  reportsByOrder: Record<string, string[]>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderStatus | "ALL">("ALL");
  const [agentId, setAgentId] = useState<string>("ALL");
  const agentName = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(
      (o) =>
        (status === "ALL" || o.status === status) &&
        (agentId === "ALL" || o.assignedAgentId === agentId) &&
        (!q || [o.id, o.customerName, o.locality, o.addressLine].some((s) => s.toLowerCase().includes(q))),
    );
  }, [orders, status, agentId, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by order ID, customer or locality"
            aria-label="Search orders"
            className="h-9 pl-8"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus | "ALL")}>
          <SelectTrigger className="h-9 sm:w-44" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={agentId} onValueChange={setAgentId}>
          <SelectTrigger className="h-9 sm:w-44" aria-label="Agent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">Locality</TableHead>
              <TableHead className="hidden sm:table-cell">Slot</TableHead>
              <TableHead className="hidden lg:table-cell">Agent</TableHead>
              <TableHead className="hidden lg:table-cell">Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Reports</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o) => {
              const reports = reportsByOrder[o.id] ?? [];
              return (
                <TableRow key={o.id}>
                  <TableCell className="pl-4 font-mono">{o.id}</TableCell>
                  <TableCell>
                    <span className="block">{o.customerName}</span>
                    <span className="block max-w-56 truncate text-xs text-muted-foreground">{o.addressLine}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{o.locality}</TableCell>
                  <TableCell className="hidden font-mono text-xs tabular sm:table-cell">
                    {formatSlot(o.slotStart, o.slotEnd)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {o.assignedAgentId ? agentName.get(o.assignedAgentId) : <span className="text-muted-foreground">Unassigned</span>}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <PriorityPill priority={o.priority} />
                  </TableCell>
                  <TableCell>
                    <OrderStatusPill status={o.status} />
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    {reports.length ? (
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        {reports.map((id) => (
                          <Link key={id} href={`/dashboard/exceptions/${id}`} className="font-mono text-xs text-primary hover:underline">
                            {id}
                          </Link>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No orders match these filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground tabular">
        Showing {rows.length} of {orders.length} orders
      </p>
    </div>
  );
}
