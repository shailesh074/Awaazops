import { connection } from "next/server";
import { getVisibleReport } from "@/server/auth/report-access";
import { errorResponse } from "@/server/http";

/** GET /api/reports/:id — visible to the reporting agent and to dispatchers. */
export async function GET(_request: Request, { params }: RouteContext<"/api/reports/[id]">) {
  try {
    await connection();
    const { id } = await params;
    return Response.json({ report: await getVisibleReport(id) });
  } catch (err) {
    return errorResponse(err);
  }
}
