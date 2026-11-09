import { connection } from "next/server";
import { canDispatch, requireViewerApi } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { ReportError } from "@/server/pipeline/errors";
import { getReadRepository, getRepository } from "@/server/repositories";

/** GET /api/lab/samples/:id/audio — playback for a stored Lab sample. Dispatchers only. */
export async function GET(_request: Request, { params }: RouteContext<"/api/lab/samples/[id]/audio">) {
  try {
    await connection();
    const viewer = await requireViewerApi();
    if (!canDispatch(viewer)) throw new ReportError("FORBIDDEN", "The Testing Lab is for dispatchers.");
    const { id } = await params;
    const sample = (await (await getReadRepository()).listLabSamples()).find((s) => s.id === id); // RLS-scoped read
    const audio = sample ? await getRepository().getLabAudio(sample.audioPath) : null;
    if (!audio) throw new ReportError("NOT_FOUND", "Sample audio not found.");
    return new Response(audio.data, {
      headers: { "content-type": audio.mimeType, "content-length": String(audio.data.byteLength), "cache-control": "private, no-store" },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
