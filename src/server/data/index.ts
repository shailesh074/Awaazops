import "server-only";
import { connection } from "next/server";
import type { AuditEvent, DashboardSummary, LabRun, LabSample, Order, ReportDetail } from "@/domain";
import { PRIORITY_RANK } from "@/lib/labels";
import { DEMO_AGENT_ID } from "@/mocks/fleet";
import { LAB_RUNS, LAB_SAMPLES } from "@/mocks/lab";
import { getRepository } from "@/server/repositories";

/**
 * Read side for pages. Operational data comes from the repository and is read at request time
 * (`connection()`), so pages need a Suspense boundary — each data route has a loading.tsx.
 * Lab runs are still demo fixtures until lab persistence exists.
 */
export function dataSource(): "demo-memory" | "database" {
  return getRepository().kind === "memory" ? "demo-memory" : "database";
}

const PENDING = new Set(["NEEDS_CLARIFICATION", "AWAITING_CONFIRMATION", "VALIDATED", "EDITED", "CONFIRMED"]);

export function isPending(r: ReportDetail): boolean {
  return PENDING.has(r.report.status);
}

async function repo() {
  await connection();
  return getRepository();
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const r = await repo();
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
  const reports = await (await repo()).listReports();
  return reports.sort((a, b) => b.report.createdAt.localeCompare(a.report.createdAt));
}

/** Pending exceptions ordered by priority, then age (oldest first). */
export async function listPriorityQueue(): Promise<ReportDetail[]> {
  return (await listReports())
    .filter(isPending)
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.report.createdAt.localeCompare(b.report.createdAt),
    );
}

export async function getReport(id: string): Promise<ReportDetail | null> {
  return (await repo()).getReport(id);
}

/** Until auth (step 8) the Agent Portal acts as the demo agent. */
export async function listReportsForAgent(agentId: string = DEMO_AGENT_ID): Promise<ReportDetail[]> {
  return (await listReports()).filter((r) => r.agent.id === agentId);
}

export async function listOrders(): Promise<Order[]> {
  const orders = await (await repo()).listOrders();
  return orders.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listAgents() {
  return (await repo()).listAgents();
}

/** Newest first; optionally only events tracing back to one report. */
export async function listAuditEvents(reportId?: string): Promise<AuditEvent[]> {
  const events = await (await repo()).listAudit();
  return reportId ? events.filter((e) => e.reportId === reportId) : events;
}

export async function listLabSamples(): Promise<LabSample[]> {
  return LAB_SAMPLES;
}

export async function getLatestLabRun(): Promise<LabRun | null> {
  return LAB_RUNS[0] ?? null;
}
