import { requireAgentApi } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { confirmReport } from "@/server/pipeline/process-report";

/** POST /api/reports/:id/confirm — the agent's explicit confirmation; the only path to an operational write. */
export async function POST(_request: Request, { params }: RouteContext<"/api/reports/[id]/confirm">) {
  try {
    const { id } = await params;
    return Response.json({ report: await confirmReport(id, (await requireAgentApi()).agentId) });
  } catch (err) {
    return errorResponse(err);
  }
}
