import { z } from "zod";
import { requireAgentApi } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { escalateReport } from "@/server/pipeline/process-report";

const bodySchema = z.object({ note: z.string().trim().max(500).nullable().optional() });

/**
 * POST /api/reports/:id/escalate — the agent hands a report that needs clarification to dispatch (e.g. the
 * order number is not in the system). Nothing changes on any order; a dispatcher resolves it.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/reports/[id]/escalate">) {
  try {
    const { id } = await params;
    const text = await request.text();
    const body = bodySchema.parse(text ? JSON.parse(text) : {});
    return Response.json({ report: await escalateReport(id, (await requireAgentApi()).agentId, body.note || null) });
  } catch (err) {
    return errorResponse(err);
  }
}
