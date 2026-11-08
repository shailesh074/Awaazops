import { connection } from "next/server";
import { getVisibleReport } from "@/server/auth/report-access";
import { errorResponse } from "@/server/http";
import { ReportError } from "@/server/pipeline/errors";
import { getRepository } from "@/server/repositories";

/** GET /api/reports/:id/recording — the agent's original audio, as evidence, for viewers who may see the report. */
export async function GET(_request: Request, { params }: RouteContext<"/api/reports/[id]/recording">) {
  try {
    await connection();
    const { id } = await params;
    const report = await getVisibleReport(id); // authorises the viewer
    const path = report.report.audioPath;
    const audio = path ? await getRepository().getRecording(path) : null;
    if (!audio) throw new ReportError("NOT_FOUND", "No recording stored for this report.");
    return new Response(audio.data, {
      headers: { "content-type": audio.mimeType, "content-length": String(audio.data.byteLength), "cache-control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
