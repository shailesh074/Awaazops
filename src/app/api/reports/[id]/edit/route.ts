import { z } from "zod";
import { actionTypeSchema } from "@/domain";
import { requireAgentApi } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { editReport } from "@/server/pipeline/process-report";

const editSchema = z
  .object({
    orderReference: z.string().trim().min(1).max(32).optional(),
    requestedAction: actionTypeSchema.optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field to edit.");

/** POST /api/reports/:id/edit — agent corrections; the report is re-verified before it can be confirmed. */
export async function POST(request: Request, { params }: RouteContext<"/api/reports/[id]/edit">) {
  try {
    const { id } = await params;
    const body = editSchema.parse(await request.json());
    return Response.json({ report: await editReport(id, (await requireAgentApi()).agentId, body) });
  } catch (err) {
    return errorResponse(err);
  }
}
