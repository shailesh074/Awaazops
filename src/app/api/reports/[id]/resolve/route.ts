import { z } from "zod";
import { actionTypeSchema } from "@/domain";
import { canDispatch, requireViewerApi } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { ReportError } from "@/server/pipeline/errors";
import { resolveEscalation } from "@/server/pipeline/process-report";

const bodySchema = z.object({
  orderId: z.string().trim().min(1).max(32),
  requestedAction: actionTypeSchema,
  notes: z.string().trim().max(500).nullable().optional(),
});

/**
 * POST /api/reports/:id/resolve — a dispatcher links an escalated report to an order and action. The choice is
 * verified like an agent's (order on the reporting agent's route, action allowed, fields present) and executed
 * only if it passes, confirmed by the dispatcher. Dispatchers only.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/reports/[id]/resolve">) {
  try {
    const viewer = await requireViewerApi();
    if (!canDispatch(viewer)) throw new ReportError("FORBIDDEN", "Only dispatchers can resolve escalated reports.");
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    return Response.json({ report: await resolveEscalation(id, viewer.userId ?? "demo-dispatcher", body) });
  } catch (err) {
    return errorResponse(err);
  }
}
