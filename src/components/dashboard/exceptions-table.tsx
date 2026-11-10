"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PriorityPill, ReportStatusPill } from "@/components/shared/status-pill";
import { PRIORITIES, type Priority, type ReportDetail, type ReportStatus } from "@/domain";
import { ACTION_LABELS, PRIORITY_LABELS, PRIORITY_RANK } from "@/lib/labels";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { issueSummary, orderLabel } from "./exception-row-cells";

const VIEWS: Array<{ id: string; label: string; statuses: ReportStatus[] | null }> = [
  { id: "all", label: "All", statuses: null },
  { id: "escalated", label: "Sent to dispatch", statuses: ["ESCALATED"] },
  { id: "pending", label: "Pending", statuses: ["ESCALATED", "AWAITING_CONFIRMATION", "NEEDS_CLARIFICATION", "VALIDATED", "EDITED", "CONFIRMED"] },
  { id: "clarify", label: "Clarification", statuses: ["NEEDS_CLARIFICATION"] },
  { id: "executed", label: "Executed", statuses: ["EXECUTED"] },
  { id: "closed", label: "Rejected / failed", statuses: ["REJECTED", "FAILED"] },
];

export function ExceptionsTable({ reports }: { reports: ReportDetail[] }) {
  const router = useRouter();
  const [view, setView] = useState("all");
  const [priority, setPriority] = useState<Priority | "ALL">("ALL");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const statuses = VIEWS.find((v) => v.id === view)?.statuses;
    const q = query.trim().toLowerCase();
    return reports
      .filter((r) => !statuses || statuses.includes(r.report.status))
      .filter((r) => priority === "ALL" || r.priority === priority)
      .filter(
        (r) =>
          !q ||
          [r.report.id, r.order?.id, r.agent.name, r.transcript?.text, r.extraction?.payload.orderReference.value]
            .filter(Boolean)
            .some((s) => s!.toLowerCase().includes(q)),
      )
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.report.createdAt.localeCompare(a.report.createdAt));
  }, [reports, view, priority, query]);

  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.id, reports.filter((r) => !v.statuses || v.statuses.includes(r.report.status)).length])),
    [reports],
  );

  return (
    <div className="space-y-4">
      {/* Filters — one row above the data */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Status" className="flex gap-1 overflow-x-auto rounded-lg border bg-surface p-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
                view === v.id ? "bg-subtle text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
              <span className="font-mono text-[10px] text-muted-foreground tabular">{counts[v.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 lg:w-64 lg:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order, agent, transcript"
              aria-label="Search exceptions"
              className="h-9 pl-8"
            />
          </div>
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority | "ALL")}>
            <SelectTrigger className="h-9 w-36" aria-label="Priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All priorities</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28 pl-4">Priority</TableHead>
              <TableHead className="w-28">Order</TableHead>
              <TableHead>Issue</TableHead>
              <TableHead className="hidden lg:table-cell">Proposed action</TableHead>
              <TableHead className="hidden md:table-cell">Agent</TableHead>
              <TableHead className="w-16">Time</TableHead>
              <TableHead className="pr-4">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const order = orderLabel(r);
              const action = r.extraction?.payload.requestedAction.value;
              const href = `/dashboard/exceptions/${r.report.id}`;
              return (
                <TableRow
                  key={r.report.id}
                  onClick={() => router.push(href)}
                  onKeyDown={(e) => e.key === "Enter" && router.push(href)}
                  tabIndex={0}
                  className="cursor-pointer focus-visible:bg-surface-raised focus-visible:outline-none"
                >
                  <TableCell className="pl-4">
                    <PriorityPill priority={r.priority} />
                  </TableCell>
                  <TableCell className={cn("font-mono", order.unresolved && "text-warning")}>{order.text}</TableCell>
                  <TableCell className="max-w-56">
                    <span className="block truncate">{issueSummary(r)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.report.id}</span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {action ? ACTION_LABELS[action] : "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{r.agent.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground tabular">
                    {formatTime(r.report.createdAt)}
                  </TableCell>
                  <TableCell className="pr-4">
                    <ReportStatusPill status={r.report.status} />
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No exceptions match these filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
