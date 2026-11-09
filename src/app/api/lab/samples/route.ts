import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ACTION_TYPES, ISSUE_TYPES, languageCodeSchema, type StoredLabSample } from "@/domain";
import { canDispatch, requireViewerApi } from "@/server/auth/session";
import { errorResponse } from "@/server/http";
import { ReportError } from "@/server/pipeline/errors";
import { getRepository } from "@/server/repositories";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_DURATION_MS = 30_500; // Prisma REST limit (30 s)

const blankToUndefined = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

const fields = z.object({
  title: z.string().min(1).max(120),
  language: languageCodeSchema,
  accent: z.string().min(1).max(80),
  noise: z.enum(["clean", "moderate", "heavy"]),
  durationMs: z.coerce.number().positive().max(MAX_DURATION_MS),
  reference: z.string().max(2000).optional(),
  expectedOrder: z.string().regex(/^\d{3,12}$/, "Expected order must be digits only").optional(),
  expectedIssue: z.enum(ISSUE_TYPES).optional(),
  expectedAction: z.enum(ACTION_TYPES).optional(),
  expectsClarification: z.enum(["true", "false"]).default("false"),
});

/** POST /api/lab/samples (multipart) — store a labelled test clip. Dispatchers only. */
export async function POST(request: Request) {
  try {
    const viewer = await requireViewerApi();
    if (!canDispatch(viewer)) throw new ReportError("FORBIDDEN", "The Testing Lab is for dispatchers.");
    const form = await request.formData();
    const f = fields.parse({
      title: blankToUndefined(form.get("title")),
      language: form.get("language"),
      accent: blankToUndefined(form.get("accent")) ?? "Unspecified",
      noise: form.get("noise"),
      durationMs: form.get("durationMs"),
      reference: blankToUndefined(form.get("reference")),
      expectedOrder: blankToUndefined(form.get("expectedOrder"))?.replace(/\D/g, "") || undefined,
      expectedIssue: blankToUndefined(form.get("expectedIssue")),
      expectedAction: blankToUndefined(form.get("expectedAction")),
      expectsClarification: blankToUndefined(form.get("expectsClarification")),
    });
    const file = form.get("audio");
    if (!(file instanceof File) || file.size === 0) throw new ReportError("BAD_REQUEST", "Audio is required.");
    if (file.size > MAX_AUDIO_BYTES) throw new ReportError("BAD_REQUEST", "Audio must be 10 MB or smaller.");
    if (!file.type.startsWith("audio/")) throw new ReportError("BAD_REQUEST", "Upload must be an audio file.");

    const id = `LS-${randomUUID().slice(0, 8)}`;
    const ext = file.type.includes("wav") ? "wav" : file.type.includes("mpeg") ? "mp3" : "audio";
    const sample: StoredLabSample = {
      id,
      title: f.title,
      language: f.language,
      accent: f.accent,
      noise: f.noise,
      durationMs: f.durationMs,
      referenceTranscript: f.reference ?? null,
      expected: {
        orderReference: f.expectedOrder ?? null,
        issue: f.expectedIssue ?? null,
        requestedAction: f.expectedAction ?? null,
        expectsClarification: f.expectsClarification === "true",
      },
      audioPath: `${id}.${ext}`,
      mimeType: file.type,
      createdBy: viewer.userId ?? "demo",
      createdAt: new Date().toISOString(),
    };
    await getRepository().saveLabSample(sample, { data: await file.arrayBuffer(), mimeType: file.type });
    return Response.json({ sample }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
