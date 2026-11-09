import "server-only";
import { connection } from "next/server";
import type { AuditEvent, DashboardSummary, LabRun, LabSample, Order, ReportDetail } from "@/domain";
import { PRIORITY_RANK } from "@/lib/labels";
import { LAB_RUNS, LAB_SAMPLES } from "@/mocks/lab";
import { isSupabaseBackend } from "@/server/env";
import { getReadRepository } from "@/server/repositories";
import { requireAgentPage, requireDispatcherPage } from "@/server/auth/session";

/**
 * Read side for pages. Every function authorises the viewer first (redirecting if needed) and then reads
 * through the user-scoped repository, so in Supabase mode Postgres RLS filters the rows as well.
 * Reads happen at request time, so pages render them inside Suspense (each data route has a loading.tsx).
 */
export function dataSource(): "demo-memory" | "database" {
  return isSupabaseBackend() ? "database" : "demo-memory";
}

const PENDING = new Set(["NEEDS_CLARIFICATION", "AWAITING_CONFIRMATION", "VALIDATED", "EDITED", "CONFIRMED"]);

export function isPending(r: ReportDetail): boolean {
  return PENDING.has(r.report.status);
}

const newestFirst = (a: ReportDetail, b: ReportDetail) => b.report.createdAt.localeCompare(a.report.createdAt);

/** Dispatcher console reads. */
async function dispatcherRepo() {
  await connection();
  await requireDispatcherPage();
  return getReadRepository();
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const r = await dispatcherRepo();
  const [orders, reports] = await Promise.all([r.listOrders(), r.listReports()]);
  return {
    totalOrders: orders.length,
    pendingExceptions: reports.filter(isPending).length,
    completedActions: reports.filter((x) => x.report.status === "EXECUTED").length,
    failedDeliveries: orders.filter((o) => o.status === "FAILED").length,
    rescheduled: orders.filter((o) => o.status === "RESCHEDULED").length,
    needsClarification: reports.filter((x) => x.report.status === "NEEDS_CLARIFICATION").length,
  };
}

/** Newest first. */
export async function listReports(): Promise<ReportDetail[]> {
  return (await (await dispatcherRepo()).listReports()).sort(newestFirst);
}

/** Pending exceptions ordered by priority, then age (oldest first). */
export async function listPriorityQueue(): Promise<ReportDetail[]> {
  return (await listReports())
    .filter(isPending)
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.report.createdAt.localeCompare(b.report.createdAt));
}

export async function getReport(id: string): Promise<ReportDetail | null> {
  return (await dispatcherRepo()).getReport(id);
}

export async function listOrders(): Promise<Order[]> {
  return (await (await dispatcherRepo()).listOrders()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listAgents() {
  return (await dispatcherRepo()).listAgents();
}

/** Newest first; optionally only events tracing back to one report. */
export async function listAuditEvents(reportId?: string): Promise<AuditEvent[]> {
  const events = await (await dispatcherRepo()).listAudit();
  return reportId ? events.filter((e) => e.reportId === reportId) : events;
}

export interface LabView {
  /** "measured": the latest real benchmark over stored samples; "demo": the scripted fixture run. */
  source: "measured" | "demo";
  run: LabRun;
  samples: LabSample[];
  /** Samples stored for the next benchmark run. */
  storedSamples: number;
}

/** The latest measured Lab run if one exists; otherwise the clearly-labelled demo run. */
export async function getLabView(): Promise<LabView> {
  const repo = await dispatcherRepo();
  const [stored, run] = await Promise.all([repo.listLabSamples(), repo.getLatestLabRun()]);
  if (run && run.results.length > 0) return { source: "measured", run, samples: stored, storedSamples: stored.length };
  return { source: "demo", run: LAB_RUNS[0], samples: LAB_SAMPLES, storedSamples: stored.length };
}

/** The signed-in agent's own reports, newest first. */
export async function listMyReports(): Promise<ReportDetail[]> {
  await connection();
  const viewer = await requireAgentPage();
  const reports = await (await getReadRepository()).listReports();
  return reports.filter((r) => r.agent.id === viewer.agentId).sort(newestFirst);
}
