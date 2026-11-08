import "server-only";
import type { ReportDetail } from "@/domain";
import { ReportError } from "@/server/pipeline/errors";
import { getReadRepository } from "@/server/repositories";
import { requireViewerApi } from "./session";

/**
 * Loads a report the current viewer may see: their own (agents) or any (dispatchers, demo).
 * In Supabase mode the read itself runs under RLS; the explicit check also covers demo mode.
 */
export async function getVisibleReport(id: string): Promise<ReportDetail> {
  const viewer = await requireViewerApi();
  const report = await (await getReadRepository()).getReport(id);
  if (!report || (viewer.role === "agent" && report.agent.id !== viewer.agentId)) {
    throw new ReportError("NOT_FOUND", `Report ${id} not found.`);
  }
  return report;
}
