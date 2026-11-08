import { connection } from "next/server";
import { getVisibleReport } from "@/server/auth/report-access";
import { errorResponse } from "@/server/http";
import { ReportError } from "@/server/pipeline/errors";
import { getRepository } from "@/server/repositories";

/**
 * GET /api/reports/:id/prompt-audio — the synthesized confirmation / clarification for a report the viewer
 * may see. Served only when the audio matches the report's current prompt text.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/reports/[id]/prompt-audio">) {
  try {
    await connection();
    const { id } = await params;
    const report = await getVisibleReport(id); // authorises the viewer
    const audio = await getRepository().getPromptAudio(id);
    if (!audio || audio.text !== report.confirmationPrompt) throw new ReportError("NOT_FOUND", "No audio for the current prompt.");
    return new Response(audio.data, {
      headers: { "content-type": audio.mimeType, "content-length": String(audio.data.byteLength), "cache-control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
