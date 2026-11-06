"use client";

import type { ActionType, LanguageCode, PipelineStage, ReportDetail } from "@/domain";

export type StageUpdate =
  | { stage: PipelineStage; state: "start" }
  | { stage: PipelineStage; state: "done"; latencyMs: number };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return new ApiError(body.error?.message ?? `Request failed (${res.status})`, res.status);
  } catch {
    return new ApiError(`Request failed (${res.status})`, res.status);
  }
}

/** Submits a voice report and streams real pipeline progress until the result arrives. */
export async function submitReport(
  input: { language: LanguageCode; audio?: Blob | null; durationMs?: number; mockTranscript?: string },
  onStage: (u: StageUpdate) => void,
): Promise<ReportDetail> {
  const form = new FormData();
  form.set("language", input.language);
  if (input.audio) form.set("audio", input.audio, "report.webm");
  if (input.durationMs) form.set("durationMs", String(Math.round(input.durationMs)));
  if (input.mockTranscript) form.set("mockTranscript", input.mockTranscript);

  const res = await fetch("/api/reports", { method: "POST", body: form });
  if (!res.ok || !res.body) throw await readError(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.type === "stage") onStage(msg);
      else if (msg.type === "result") return msg.report as ReportDetail;
      else if (msg.type === "error") throw new ApiError(msg.error?.message ?? "Processing failed.", 500);
    }
  }
  throw new ApiError("The connection closed before the report finished processing.", 502);
}

async function post(path: string, body?: unknown): Promise<ReportDetail> {
  const res = await fetch(path, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await readError(res);
  return ((await res.json()) as { report: ReportDetail }).report;
}

export const confirmReport = (id: string) => post(`/api/reports/${encodeURIComponent(id)}/confirm`);
export const rejectReport = (id: string) => post(`/api/reports/${encodeURIComponent(id)}/reject`);
export const editReport = (
  id: string,
  edit: { orderReference?: string; requestedAction?: ActionType; notes?: string | null },
) => post(`/api/reports/${encodeURIComponent(id)}/edit`, edit);
