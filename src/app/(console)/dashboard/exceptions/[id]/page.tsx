import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CircleUser, Clock, MapPin, OctagonX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DemoDataBanner } from "@/components/shared/demo-data-banner";
import { EvidenceInspector } from "@/components/shared/evidence-inspector";
import { JsonView } from "@/components/shared/json-view";
import { ClipPlayer } from "@/components/audio/clip-player";
import { Panel } from "@/components/shared/panel";
import { ProviderBadge } from "@/components/shared/provider-badge";
import { OrderStatusPill, PriorityPill, ReportStatusPill } from "@/components/shared/status-pill";
import { ValidationChecklist } from "@/components/shared/validation-checklist";
import { AuditTimeline } from "@/components/dashboard/audit-timeline";
import { StageTimings } from "@/components/dashboard/stage-timings";
import { issueSummary } from "@/components/dashboard/exception-row-cells";
import { getReport, listAgents, listAuditEvents } from "@/server/data";
import { formatDateTime, formatDuration, formatSlot } from "@/lib/format";
import { ACTION_LABELS, LANGUAGE_LABELS_SHORT } from "@/lib/labels";

export const metadata: Metadata = { title: "Exception" };

export default function ExceptionDetailPage({ params }: PageProps<"/dashboard/exceptions/[id]">) {
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/exceptions"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Exceptions
      </Link>
      {/* Params are request data under Cache Components, so the detail streams inside Suspense. */}
      <Suspense fallback={<DetailSkeleton />}>
        {params.then(({ id }) => (
          <ExceptionDetail id={id} />
        ))}
      </Suspense>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-96 xl:col-span-2" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

async function ExceptionDetail({ id }: { id: string }) {
  const detail = await getReport(id);
  if (!detail) notFound();
  const { report, agent, transcript, extraction, validation, order, action } = detail;
  const [events, agents] = await Promise.all([listAuditEvents(report.id), listAgents()]);
  // listAuditEvents is newest first; the per-report trail reads better oldest first.
  const scoped = [...events].reverse();

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="font-mono text-xs text-muted-foreground">{report.id}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{issueSummary(detail)}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CircleUser className="size-3.5" /> {agent.name} · {agent.hub}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {formatDateTime(report.createdAt)}
            </span>
            <span>
              {LANGUAGE_LABELS_SHORT[report.language]} · {formatDuration(report.audioDurationMs ?? 0)} audio
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PriorityPill priority={detail.priority} />
          <ReportStatusPill status={report.status} />
        </div>
      </header>

      <DemoDataBanner />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {transcript && extraction ? (
            <Panel
              title="Evidence"
              description="Hover a field to see the words it was extracted from"
              actions={<ProviderBadge provenance={extraction.provenance} />}
            >
              {report.audioPath ? (
                <div className="mb-4 rounded-lg border bg-background/60 p-3">
                  <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Agent recording</p>
                  <ClipPlayer url={`/api/reports/${encodeURIComponent(report.id)}/recording`} durationMs={report.audioDurationMs ?? 0} />
                </div>
              ) : null}
              <Tabs defaultValue="fields">
                <TabsList className="mb-4">
                  <TabsTrigger value="fields">Fields</TabsTrigger>
                  <TabsTrigger value="json">Structured output</TabsTrigger>
                </TabsList>
                <TabsContent value="fields">
                  <EvidenceInspector
                    transcript={transcript.text}
                    payload={extraction.payload}
                    transcriptAside={<ProviderBadge provenance={transcript.provenance} />}
                  />
                </TabsContent>
                <TabsContent value="json">
                  <JsonView value={extraction.payload} className="max-h-[480px]" />
                </TabsContent>
              </Tabs>
            </Panel>
          ) : (
            <Panel title="Pipeline failure">
              <p className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-sm text-destructive">
                <OctagonX className="mt-0.5 size-4 shrink-0" />
                {report.failureReason ?? "The report could not be processed."}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                No extraction was attempted and nothing was changed. The agent was asked to record again.
              </p>
            </Panel>
          )}

          {validation ? (
            <Panel title="Verification" description="Deterministic checks run on the structured output">
              <ValidationChecklist validation={validation} />
              {validation.clarificationQuestion ? (
                <p className="mt-4 rounded-lg border border-warning/25 bg-warning/[0.06] px-3 py-2.5 text-sm text-pretty">
                  <span className="mb-0.5 block text-xs text-warning">Asked the agent</span>
                  {validation.clarificationQuestion}
                </p>
              ) : null}
            </Panel>
          ) : null}
        </div>

        <div className="space-y-6">
          <Panel title="Order">
            {order ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono">{order.id}</span>
                  <OrderStatusPill status={order.status} />
                </div>
                <div>
                  <p>{order.customerName}</p>
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="mt-0.5 size-3 shrink-0" />
                    {order.addressLine}, {order.locality} {order.pincode}
                  </p>
                </div>
                <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">Slot</dt>
                  <dd className="font-mono tabular">{formatSlot(order.slotStart, order.slotEnd)}</dd>
                  <dt className="text-muted-foreground">Instructions</dt>
                  <dd>{order.instructions ?? "—"}</dd>
                </dl>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not resolved
                {extraction?.payload.orderReference.value
                  ? ` — agent said “${extraction.payload.orderReference.value}”, which did not match an order.`
                  : " — no order number was spoken."}
              </p>
            )}
          </Panel>

          <Panel title="Action">
            {action ? (
              <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="text-sm">{ACTION_LABELS[action.type]}</dd>
                <dt className="text-muted-foreground">Confirmed</dt>
                <dd>{formatDateTime(action.confirmedAt)} by agent</dd>
                <dt className="text-muted-foreground">Executed</dt>
                <dd>{action.executedAt ? formatDateTime(action.executedAt) : "Pending"}</dd>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                No action executed. Operational updates require the agent&apos;s explicit confirmation.
              </p>
            )}
          </Panel>

          <Panel
            title="Pipeline latency"
            actions={
              report.timingSource === "illustrative" ? (
                <span className="font-mono text-[10px] tracking-wider text-simulated uppercase">Illustrative</span>
              ) : (
                <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Measured</span>
              )
            }
          >
            <StageTimings timings={report.timings} />
          </Panel>

          <Panel title="Audit trail">
            <AuditTimeline events={scoped} agents={agents} linkReports={false} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
