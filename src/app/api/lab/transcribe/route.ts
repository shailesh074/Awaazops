import { z } from "zod";
import { languageCodeSchema } from "@/domain";
import { getSttProvider } from "@/server/providers/stt";
import { ProviderError } from "@/server/providers/errors";
import { ReportError } from "@/server/pipeline/errors";
import { errorResponse } from "@/server/http";
import { canDispatch, requireViewerApi } from "@/server/auth/session";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/lab/transcribe (multipart: audio, language, durationMs?)
 * Speech-to-text only, for the Testing Lab. Refuses to run on the mock provider: a scripted transcript
 * would make WER and latency meaningless.
 */
export async function POST(request: Request) {
  try {
    const viewer = await requireViewerApi();
    if (!canDispatch(viewer)) throw new ReportError("FORBIDDEN", "The Testing Lab is for dispatchers.");
    const stt = getSttProvider();
    if (stt.id === "mock-stt") {
      throw new ReportError("INVALID_STATE", "Speech-to-text is simulated. Configure Gnani Prisma to run lab samples.");
    }
    const form = await request.formData();
    const language = languageCodeSchema.parse(form.get("language"));
    const durationMs = z.coerce.number().nonnegative().optional().parse(form.get("durationMs") ?? undefined);
    const file = form.get("audio");
    if (!(file instanceof File) || file.size === 0) throw new ReportError("BAD_REQUEST", "Audio is required.");
    if (file.size > MAX_AUDIO_BYTES) throw new ReportError("BAD_REQUEST", "Audio must be 10 MB or smaller.");

    const result = await stt.transcribe({ data: await file.arrayBuffer(), mimeType: file.type, durationMs }, { language });
    return Response.json({ transcript: result.text, provenance: result.provenance });
  } catch (err) {
    if (err instanceof ProviderError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: 502 });
    }
    return errorResponse(err);
  }
}
