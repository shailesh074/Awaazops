import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { AlertTriangle, CalendarClock, CheckCircle2, Package, XCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataNotice } from "@/components/shared/data-notice";
import { KpiGrid, KpiTile } from "@/components/shared/kpi-tile";
import { Panel } from "@/components/shared/panel";
import { BarList } from "@/components/shared/bar-list";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityQueue } from "@/components/dashboard/priority-queue";
import { AuditTimeline } from "@/components/dashboard/audit-timeline";
import { ProviderStatusList } from "@/components/dashboard/provider-status-list";
import { getProviderStatus } from "@/server/providers/status";
import {
  getDashboardSummary,
  listAgents,
  listAuditEvents,
  listPriorityQueue,
  listReports,
} from "@/server/data";
import { ISSUE_LABELS } from "@/lib/labels";
import { ISSUE_TYPES } from "@/domain";

export const metadata: Metadata = { title: "Operations overview" };

/** Reads the server environment at request time, so it must not be prerendered. */
async function ProviderStatusPanel() {
  await connection();
  return <ProviderStatusList providers={getProviderStatus()} />;
}

export default async function DashboardPage() {
  const [summary, queue, reports, events, agents] = await Promise.all([
    getDashboardSummary(),
    listPriorityQueue(),
    listReports(),
    listAuditEvents(),
    listAgents(),
  ]);

  const issueCounts = ISSUE_TYPES.map((t) => ({
    label: ISSUE_LABELS[t],
    value: reports.filter((r) => r.extraction?.payload.issue.value === t).length,
  }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const verifiedRate =
    reports.filter((r) => r.validation?.outcome === "VERIFIED").length /
    Math.max(1, reports.filter((r) => r.validation).length);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations · Bengaluru · 6 Nov"
        title="Overview"
        description="Delivery exceptions reported by voice, verified against orders and actioned after confirmation."
      />
      <DataNotice />

      <KpiGrid className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
        <KpiTile label="Total orders" value={summary.totalOrders} icon={Package} hint="Today's manifest" />
        <KpiTile
          label="Pending exceptions"
          value={summary.pendingExceptions}
          icon={AlertTriangle}
          emphasis
          hint={`${summary.needsClarification} need clarification`}
        />
        <KpiTile label="Completed actions" value={summary.completedActions} icon={CheckCircle2} hint="Confirmed and executed" />
        <KpiTile label="Failed deliveries" value={summary.failedDeliveries} icon={XCircle} hint="Marked failed today" />
        <KpiTile
          label="Rescheduled"
          value={summary.rescheduled}
          icon={CalendarClock}
          hint="New slot agreed"
          className="col-span-2 sm:col-span-1"
        />
      </KpiGrid>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel
          title="Priority queue"
          description="Pending exceptions, highest priority and oldest first"
          className="xl:col-span-2"
          actions={
            <Link href="/dashboard/exceptions" className="text-xs text-primary hover:underline">
              All exceptions
            </Link>
          }
          bodyClassName="pb-0"
        >
          <PriorityQueue reports={queue} />
        </Panel>

        <div className="space-y-6">
          <Panel title="Issue mix" description={`${reports.length} voice reports today`}>
            <BarList data={issueCounts} ariaLabel="Voice reports by issue type" />
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              <span className="font-mono text-foreground tabular">{Math.round(verifiedRate * 100)}%</span> of
              processed reports verified on first pass
            </p>
          </Panel>
          <Panel title="AI pipeline" description="Active providers (live server config)">
            <Suspense fallback={<Skeleton className="h-[180px] w-full" />}>
              <ProviderStatusPanel />
            </Suspense>
          </Panel>
        </div>
      </div>

      <Panel
        title="Recent activity"
        actions={
          <Link href="/dashboard/audit" className="text-xs text-primary hover:underline">
            Full audit trail
          </Link>
        }
      >
        <AuditTimeline events={events.slice(0, 8)} agents={agents} />
      </Panel>
    </div>
  );
}
