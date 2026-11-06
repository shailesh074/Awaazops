import { connection } from "next/server";
import { getCurrentAgentId } from "@/server/auth/current-agent";
import { errorResponse } from "@/server/http";
import { ReportError } from "@/server/pipeline/errors";
import { getRepository } from "@/server/repositories";

/**
 * GET /api/reports/:id/prompt-audio — the synthesized confirmation / clarification for the agent's report.
 * Served only when the audio matches the report's current prompt text.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/reports/[id]/prompt-audio">) {
  try {
    await connection();
    const { id } = await params;
    const repo = getRepository();
    const stored = await repo.getStoredReport(id);
    if (!stored || stored.report.agentId !== (await getCurrentAgentId())) throw new ReportError("NOT_FOUND", `Report ${id} not found.`);
    const audio = await repo.getPromptAudio(id);
    if (!audio || audio.text !== stored.confirmationPrompt) throw new ReportError("NOT_FOUND", "No audio for the current prompt.");
    return new Response(audio.data, {
      headers: {
        "content-type": audio.mimeType,
        "content-length": String(audio.data.byteLength),
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
