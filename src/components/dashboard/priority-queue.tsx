import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReportDetail } from "@/domain";
import { PriorityPill, ReportStatusPill } from "@/components/shared/status-pill";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { issueSummary, orderLabel } from "./exception-row-cells";

export function PriorityQueue({ reports }: { reports: ReportDetail[] }) {
  if (reports.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No pending exceptions.</p>;
  }
  return (
    <ul className="-mx-5 divide-y border-t">
      {reports.map((r) => {
        const order = orderLabel(r);
        return (
          <li key={r.report.id}>
            <Link
              href={`/dashboard/exceptions/${r.report.id}`}
              className="group grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-raised sm:grid-cols-[5.5rem_6.5rem_1fr_auto_1.25rem]"
            >
              <PriorityPill priority={r.priority} />
              <span className={cn("hidden font-mono text-sm sm:block", order.unresolved && "text-warning")}>
                {order.text}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm">{issueSummary(r)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {r.agent.name} · {formatTime(r.report.createdAt)}
                </span>
              </span>
              <ReportStatusPill status={r.report.status} />
              <ArrowRight className="hidden size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
