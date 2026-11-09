import { canDispatch, requireViewerApi } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { ReportError } from "@/server/pipeline/errors";
import { runLabBenchmark, type LabProgress } from "@/server/lab/run-lab";

/**
 * POST /api/lab/runs — run the benchmark over every stored sample. Streams NDJSON progress
 * (`start`, one `sample` per clip), then `{type:"done", runId}` or `{type:"error"}`. Dispatchers only.
 */
export async function POST() {
  let createdBy: string;
  try {
    const viewer = await requireViewerApi();
    if (!canDispatch(viewer)) throw new ReportError("FORBIDDEN", "The Testing Lab is for dispatchers.");
    createdBy = viewer.userId ?? "demo";
  } catch (err) {
    return errorResponse(err);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const run = await runLabBenchmark(createdBy, (p: LabProgress) => send(p));
        send({ type: "done", runId: run.id });
      } catch (err) {
        if (!(err instanceof ReportError)) console.error("[api/lab/runs]", err);
        send({ type: "error", error: { message: err instanceof ReportError ? err.message : "Benchmark failed." } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
