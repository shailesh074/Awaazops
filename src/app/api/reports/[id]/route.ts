import { connection } from "next/server";
import { getCurrentAgentId } from "@/server/auth/current-agent";
import { errorResponse } from "@/server/http";
import { ReportError } from "@/server/pipeline/errors";
import { getReport } from "@/server/data";

/** GET /api/reports/:id — one of the current agent's reports. */
export async function GET(_request: Request, { params }: RouteContext<"/api/reports/[id]">) {
  try {
    await connection();
    const { id } = await params;
    const report = await getReport(id);
    if (!report || report.agent.id !== (await getCurrentAgentId())) throw new ReportError("NOT_FOUND", `Report ${id} not found.`);
    return Response.json({ report });
  } catch (err) {
    return errorResponse(err);
  }
}
