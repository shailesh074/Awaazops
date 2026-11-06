import { z } from "zod";
import { languageCodeSchema } from "@/domain";
import { getCurrentAgentId } from "@/server/auth/current-agent";
import { errorResponse } from "@/server/http";
import { ReportError } from "@/server/pipeline/errors";
import { submitReport, type StageEvent } from "@/server/pipeline/process-report";
import { listReportsForAgent } from "@/server/data";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const fieldsSchema = z.object({
  language: languageCodeSchema,
  durationMs: z.coerce.number().nonnegative().max(120_000).optional(),
  mockTranscript: z.string().trim().max(500).optional(),
});

/** GET /api/reports — the current agent's reports, newest first. */
export async function GET() {
  try {
    return Response.json({ reports: await listReportsForAgent(await getCurrentAgentId()) });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST /api/reports (multipart/form-data: audio?, language, durationMs?, mockTranscript?)
 * Streams NDJSON: `{type:"stage",...}` as each pipeline stage starts/finishes, then
 * `{type:"result", report}` or `{type:"error", error}`.
 */
export async function POST(request: Request) {
  let input: Parameters<typeof submitReport>[0];
  try {
    const form = await request.formData();
    const fields = fieldsSchema.parse({
      language: form.get("language"),
      durationMs: form.get("durationMs") ?? undefined,
      mockTranscript: form.get("mockTranscript") ?? undefined,
    });
    const file = form.get("audio");
    let audio = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_AUDIO_BYTES) throw new ReportError("BAD_REQUEST", "Audio must be 10 MB or smaller.");
      if (!file.type.startsWith("audio/")) throw new ReportError("BAD_REQUEST", "Upload must be an audio file.");
      audio = { data: await file.arrayBuffer(), mimeType: file.type, durationMs: fields.durationMs };
    }
    input = {
      agentId: await getCurrentAgentId(),
      language: fields.language,
      audio,
      mockTranscript: fields.mockTranscript,
    };
  } catch (err) {
    return errorResponse(err);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const report = await submitReport(input, (e: StageEvent) => send(e));
        send({ type: "result", report });
      } catch (err) {
        const message = err instanceof ReportError ? err.message : "Processing failed.";
        if (!(err instanceof ReportError)) console.error("[api/reports]", err);
        send({ type: "error", error: { message } });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
