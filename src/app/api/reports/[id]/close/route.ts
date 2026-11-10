import { z } from "zod";
import { canDispatch, requireViewerApi } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { ReportError } from "@/server/pipeline/errors";
import { closeEscalation } from "@/server/pipeline/process-report";

const bodySchema = z.object({ note: z.string().trim().min(3, "Say why it is being closed.").max(500) });

/** POST /api/reports/:id/close — a dispatcher closes an escalated report with a note; no order changes. */
export async function POST(request: Request, { params }: RouteContext<"/api/reports/[id]/close">) {
  try {
    const viewer = await requireViewerApi();
    if (!canDispatch(viewer)) throw new ReportError("FORBIDDEN", "Only dispatchers can close escalated reports.");
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    return Response.json({ report: await closeEscalation(id, viewer.userId ?? "demo-dispatcher", body.note) });
  } catch (err) {
    return errorResponse(err);
  }
}
