import "server-only";
import type { AuditEvent, DashboardSummary, LabRun, LabSample, Order, ReportDetail } from "@/domain";
import { PRIORITY_RANK } from "@/lib/labels";
import { AGENTS, DEMO_AGENT_ID, ORDERS } from "@/mocks/fleet";
import { AUDIT_EVENTS, REPORTS } from "@/mocks/reports";
import { LAB_RUNS, LAB_SAMPLES } from "@/mocks/lab";

/**
 * Data access seam. Every function here currently reads DEMO fixtures; in step 8 the bodies switch to
 * Supabase queries and `DATA_SOURCE` becomes "database". Callers do not change.
 */
export const DATA_SOURCE: "demo" | "database" = "demo";

const PENDING = new Set(["NEEDS_CLARIFICATION", "AWAITING_CONFIRMATION", "VALIDATED", "EDITED", "CONFIRMED"]);

export function isPending(r: ReportDetail): boolean {
  return PENDING.has(r.report.status);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return {
    totalOrders: ORDERS.length,
    pendingExceptions: REPORTS.filter(isPending).length,
    completedActions: REPORTS.filter((r) => r.report.status === "EXECUTED").length,
    failedDeliveries: ORDERS.filter((o) => o.status === "FAILED").length,
    rescheduled: ORDERS.filter((o) => o.status === "RESCHEDULED").length,
    needsClarification: REPORTS.filter((r) => r.report.status === "NEEDS_CLARIFICATION").length,
  };
}

/** Newest first. */
export async function listReports(): Promise<ReportDetail[]> {
  return [...REPORTS].sort((a, b) => b.report.createdAt.localeCompare(a.report.createdAt));
}

/** Pending exceptions ordered by priority, then age (oldest first). */
export async function listPriorityQueue(): Promise<ReportDetail[]> {
  return REPORTS.filter(isPending).sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      a.report.createdAt.localeCompare(b.report.createdAt),
  );
}

export async function getReport(id: string): Promise<ReportDetail | null> {
  return REPORTS.find((r) => r.report.id === id) ?? null;
}

export async function listReportsForAgent(agentId: string = DEMO_AGENT_ID): Promise<ReportDetail[]> {
  return (await listReports()).filter((r) => r.agent.id === agentId);
}

export async function listOrders(): Promise<Order[]> {
  return [...ORDERS].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listAgents() {
  return AGENTS;
}

export async function listAuditEvents(entityIds?: string[]): Promise<AuditEvent[]> {
  if (!entityIds) return AUDIT_EVENTS;
  const ids = new Set(entityIds);
  return AUDIT_EVENTS.filter((e) => ids.has(e.entityId));
}

export async function listLabSamples(): Promise<LabSample[]> {
  return LAB_SAMPLES;
}

export async function getLatestLabRun(): Promise<LabRun | null> {
  return LAB_RUNS[0] ?? null;
}
