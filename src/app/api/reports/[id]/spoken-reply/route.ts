import { z } from "zod";
import { languageCodeSchema } from "@/domain";
import { requireAgentApi } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { ReportError } from "@/server/pipeline/errors";
import { answerByVoice } from "@/server/pipeline/process-report";

const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // a yes/no reply is a few seconds

const fields = z.object({
  language: languageCodeSchema,
  durationMs: z.coerce.number().positive().max(15_000),
});

/**
 * POST /api/reports/:id/spoken-reply (multipart: audio, language, durationMs) — the agent answers the
 * confirmation prompt by voice. Confirms only on a clear "yes", rejects only on a clear "no"; otherwise
 * nothing changes. Responds `{ decision, heard, report }`.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/reports/[id]/spoken-reply">) {
  try {
    const viewer = await requireAgentApi();
    const { id } = await params;
    const form = await request.formData();
    const f = fields.parse({ language: form.get("language"), durationMs: form.get("durationMs") });
    const file = form.get("audio");
    if (!(file instanceof File) || file.size === 0) throw new ReportError("BAD_REQUEST", "Audio is required.");
    if (file.size > MAX_AUDIO_BYTES) throw new ReportError("BAD_REQUEST", "Reply is too long — keep it to a few seconds.");
    if (!file.type.startsWith("audio/")) throw new ReportError("BAD_REQUEST", "Upload must be an audio file.");
    const audio = { data: await file.arrayBuffer(), mimeType: file.type, durationMs: f.durationMs };
    return Response.json(await answerByVoice(id, viewer.agentId, audio, f.language));
  } catch (err) {
    return errorResponse(err);
  }
}
