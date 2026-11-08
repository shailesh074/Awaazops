import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import { DemoDataBanner } from "@/components/shared/demo-data-banner";
import { ReportStatusPill } from "@/components/shared/status-pill";
import { displayValue } from "@/lib/extraction-display";
import { listMyReports } from "@/server/data";
import { formatDateTime, formatDuration } from "@/lib/format";
import { ACTION_LABELS } from "@/lib/labels";

export const metadata: Metadata = { title: "My reports" };

export default async function AgentHistoryPage() {
  const reports = await listMyReports();
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">My reports</h1>
        <p className="text-sm text-muted-foreground">Previous voice reports and what happened to them.</p>
      </header>
      <DemoDataBanner />
      <ul className="space-y-2">
        {reports.map(({ report, transcript, extraction, validation, action, order }) => (
          <li key={report.id}>
            <details className="group rounded-xl border bg-surface open:bg-surface-raised">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{order?.id ?? "No order"}</span>
                    <ReportStatusPill status={report.status} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDateTime(report.createdAt)} ·{" "}
                    {extraction?.payload.requestedAction.value
                      ? ACTION_LABELS[extraction.payload.requestedAction.value]
                      : (report.failureReason ?? "—")}
                  </p>
                </div>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-3 border-t px-4 py-3 text-sm">
                {transcript ? <p className="text-pretty text-foreground/80">“{transcript.text}”</p> : null}
                <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd className="font-mono tabular">{formatDuration(report.audioDurationMs ?? 0)}</dd>
                  {extraction ? (
                    <>
                      <dt className="text-muted-foreground">Issue</dt>
                      <dd>{displayValue(extraction.payload, "issue") ?? "—"}</dd>
                    </>
                  ) : null}
                  {validation?.clarificationQuestion ? (
                    <>
                      <dt className="text-muted-foreground">System</dt>
                      <dd>{validation.clarificationQuestion}</dd>
                    </>
                  ) : null}
                  {action ? (
                    <>
                      <dt className="text-muted-foreground">Confirmed</dt>
                      <dd>{formatDateTime(action.confirmedAt)}</dd>
                    </>
                  ) : null}
                </dl>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
