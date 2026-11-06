import Link from "next/link";
import { Bot, CircleUser, type LucideIcon } from "lucide-react";
import type { Agent, AuditEvent } from "@/domain";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const EVENT_LABELS: Record<string, string> = {
  REPORT_SUBMITTED: "Report submitted",
  VALIDATION_COMPLETED: "Validation completed",
  ACTION_CONFIRMED: "Action confirmed",
  ACTION_EXECUTED: "Action executed",
  ORDER_UPDATED: "Order updated",
  REPORT_REJECTED: "Report rejected",
  REPORT_EDITED: "Report edited by agent",
  PIPELINE_FAILED: "Pipeline failed",
};

function describe(e: AuditEvent): string | null {
  const after = (e.after ?? {}) as Record<string, unknown>;
  const before = (e.before ?? {}) as Record<string, unknown>;
  if (e.event === "ORDER_UPDATED" && before.status !== after.status) return `${before.status} → ${after.status}`;
  if (e.event === "ORDER_UPDATED" && before.slotStart !== after.slotStart) return "Slot changed";
  if (e.event === "ORDER_UPDATED") return "Instructions changed";
  if (e.event === "REPORT_EDITED") return `→ ${String(after.outcome ?? "")}`;
  if (e.event === "VALIDATION_COMPLETED") return String(after.outcome);
  if (e.event === "ACTION_CONFIRMED" || e.event === "ACTION_EXECUTED") return String(after.action ?? after.type ?? "");
  if (e.event === "PIPELINE_FAILED") return String(after.reason ?? "");
  return null;
}

export function AuditTimeline({
  events,
  agents,
  linkReports = true,
  className,
}: {
  events: AuditEvent[];
  agents: Agent[];
  linkReports?: boolean;
  className?: string;
}) {
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  return (
    <ol className={cn("relative space-y-0", className)}>
      {events.map((e, i) => {
        const Icon: LucideIcon = e.actorRole === "AGENT" ? CircleUser : Bot;
        const detail = describe(e);
        const reportId = e.reportId;
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < events.length - 1 ? (
              <span className="absolute top-7 bottom-1 left-[13px] w-px bg-border" aria-hidden="true" />
            ) : null}
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border bg-surface",
                e.event === "PIPELINE_FAILED" && "border-destructive/40 text-destructive",
                e.event === "ACTION_EXECUTED" && "border-success/40 text-success",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm">{EVENT_LABELS[e.event] ?? e.event}</p>
                <time className="font-mono text-[11px] text-muted-foreground tabular" dateTime={e.createdAt}>
                  {formatDateTime(e.createdAt)}
                </time>
              </div>
              <p className="text-xs text-muted-foreground">
                {e.actorRole === "AGENT" ? (agentName.get(e.actorId) ?? e.actorId) : "System"} ·{" "}
                <span className="font-mono">{e.entityId}</span>
                {detail ? <> · {detail}</> : null}
                {linkReports && reportId ? (
                  <>
                    {" · "}
                    <Link href={`/dashboard/exceptions/${reportId}`} className="text-primary hover:underline">
                      evidence
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
