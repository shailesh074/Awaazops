import { requireAgentApi } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { rejectReport } from "@/server/pipeline/process-report";

/** POST /api/reports/:id/reject — the agent discards the proposed action. Nothing is changed. */
export async function POST(_request: Request, { params }: RouteContext<"/api/reports/[id]/reject">) {
  try {
    const { id } = await params;
    return Response.json({ report: await rejectReport(id, (await requireAgentApi()).agentId) });
  } catch (err) {
    return errorResponse(err);
  }
}
