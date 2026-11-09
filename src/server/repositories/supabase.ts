import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent, LabResult, LabRun, StoredLabSample } from "@/domain";
import {
  OrderChangedError,
  type ConfirmedActionCommit,
  type OperationsRepository,
  type StoredAudio,
  type StoredPromptAudio,
  type StoredLabRun,
  type StoredReport,
} from "./types";
import {
  REPORT_SELECT,
  agentFromRow,
  auditFromRow,
  orderFromRow,
  reportDetailFromRow,
  storedReportFromRow,
  type AgentRow,
  type AuditRow,
  type OrderRow,
  type ReportRow,
  labResultFromRow,
  labSampleFromRow,
  labSampleToRow,
  type LabResultRow,
  type LabSampleRow,
} from "./supabase-mapping";

const RECORDINGS = "recordings";
const PROMPT_AUDIO = "prompt-audio";
const LAB_AUDIO = "lab-audio";

/** Throws with context on any Supabase error; never swallows. */
function check<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new Error(`Supabase ${what} failed: ${res.error.message}`);
  return res.data;
}

const ext = (mime: string) => (mime.includes("mpeg") ? "mp3" : mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : "bin");

/**
 * Postgres-backed repository. Constructed with either a user-scoped client (reads under RLS) or the
 * service-role client (server pipeline). Multi-row writes go through transactional SQL functions.
 */
export class SupabaseRepository implements OperationsRepository {
  readonly kind = "supabase" as const;

  constructor(private readonly db: SupabaseClient) {}

  async listAgents() {
    return (check(await this.db.from("agents").select("*").order("id"), "list agents") ?? []).map((r) => agentFromRow(r as AgentRow));
  }
  async getAgent(id: string) {
    const row = check(await this.db.from("agents").select("*").eq("id", id).maybeSingle(), "get agent");
    return row ? agentFromRow(row as AgentRow) : null;
  }

  async listOrders() {
    return (check(await this.db.from("orders").select("*"), "list orders") ?? []).map((r) => orderFromRow(r as OrderRow));
  }
  async getOrder(id: string) {
    const row = check(await this.db.from("orders").select("*").eq("id", id).maybeSingle(), "get order");
    return row ? orderFromRow(row as OrderRow) : null;
  }

  private async joinDetails(rows: ReportRow[]) {
    const [agents, orders] = await Promise.all([this.listAgents(), this.listOrders()]);
    const agentMap = new Map(agents.map((a) => [a.id, a]));
    const orderMap = new Map(orders.map((o) => [o.id, o]));
    return rows.flatMap((r) => {
      const d = reportDetailFromRow(r, agentMap, orderMap);
      return d ? [d] : [];
    });
  }

  async listReports() {
    const rows = check(await this.db.from("voice_reports").select(REPORT_SELECT).order("created_at", { ascending: false }), "list reports");
    return this.joinDetails(rows as ReportRow[]);
  }
  async getReport(id: string) {
    const row = check(await this.db.from("voice_reports").select(REPORT_SELECT).eq("id", id).maybeSingle(), "get report");
    return row ? ((await this.joinDetails([row as ReportRow]))[0] ?? null) : null;
  }
  async getStoredReport(id: string) {
    const row = check(await this.db.from("voice_reports").select(REPORT_SELECT).eq("id", id).maybeSingle(), "get report");
    return row ? storedReportFromRow(row as ReportRow) : null;
  }
  async saveReport(stored: StoredReport) {
    check(await this.db.rpc("save_report", { p: stored }), "save report");
  }
  async nextReportId() {
    return check(await this.db.rpc("next_report_id"), "next report id") as string;
  }

  async commitConfirmedAction(c: ConfirmedActionCommit) {
    const res = await this.db.rpc("commit_confirmed_action", {
      p_report_id: c.reportId,
      p_report_timings: c.timings,
      p_executed_at: c.executedAt,
      p_action: c.action,
      p_order: c.order,
      p_expected_order_updated_at: c.expectedOrderUpdatedAt,
      p_audit: c.audit,
    });
    if (res.error?.message.includes("ORDER_CHANGED")) throw new OrderChangedError(c.order.id);
    check(res, "commit confirmed action");
  }

  async savePromptAudio(reportId: string, audio: StoredPromptAudio) {
    const path = `${reportId}.${ext(audio.mimeType)}`;
    check(await this.db.storage.from(PROMPT_AUDIO).upload(path, audio.data, { contentType: audio.mimeType, upsert: true }), "upload prompt audio");
    check(
      await this.db.from("prompt_audio").upsert({ report_id: reportId, storage_path: path, mime_type: audio.mimeType, text: audio.text, provenance: audio.provenance }),
      "save prompt audio",
    );
  }
  async getPromptAudio(reportId: string) {
    const row = check(await this.db.from("prompt_audio").select("*").eq("report_id", reportId).maybeSingle(), "get prompt audio") as
      | { storage_path: string; mime_type: string; text: string; provenance: StoredPromptAudio["provenance"] }
      | null;
    if (!row) return null;
    const blob = check(await this.db.storage.from(PROMPT_AUDIO).download(row.storage_path), "download prompt audio");
    if (!blob) return null;
    return { data: await blob.arrayBuffer(), mimeType: row.mime_type, text: row.text, provenance: row.provenance };
  }

  async saveRecording(reportId: string, agentId: string, audio: StoredAudio) {
    const path = `${agentId}/${reportId}.${ext(audio.mimeType)}`;
    check(await this.db.storage.from(RECORDINGS).upload(path, audio.data, { contentType: audio.mimeType, upsert: true }), "upload recording");
    return path;
  }
  async getRecording(path: string) {
    const res = await this.db.storage.from(RECORDINGS).download(path);
    if (res.error) return null;
    return { data: await res.data.arrayBuffer(), mimeType: res.data.type || "audio/wav" };
  }

  async appendAudit(event: Omit<AuditEvent, "id">) {
    const rows = check(await this.db.rpc("append_audit", { p_events: [event] }), "append audit") as AuditRow[];
    return auditFromRow(rows[0]);
  }
  async listLabSamples() {
    const rows = check(await this.db.from("lab_samples").select("*").order("created_at"), "list lab samples");
    return ((rows ?? []) as LabSampleRow[]).map(labSampleFromRow);
  }
  async saveLabSample(sample: StoredLabSample, audio: StoredAudio) {
    check(await this.db.storage.from(LAB_AUDIO).upload(sample.audioPath, audio.data, { contentType: audio.mimeType, upsert: true }), "upload lab audio");
    check(await this.db.from("lab_samples").upsert(labSampleToRow(sample)), "save lab sample");
  }
  async getLabAudio(path: string) {
    const res = await this.db.storage.from(LAB_AUDIO).download(path);
    if (res.error) return null;
    return { data: await res.data.arrayBuffer(), mimeType: res.data.type || "audio/wav" };
  }
  async saveLabRun(run: StoredLabRun) {
    check(
      await this.db.from("lab_runs").upsert({
        id: run.id, label: run.label, status: run.status, providers: run.providers, sample_count: run.sampleCount,
        created_by: run.createdBy, created_at: run.createdAt, completed_at: run.completedAt,
      }),
      "save lab run",
    );
  }
  async saveLabResult(runId: string, r: LabResult) {
    check(
      await this.db.from("lab_results").upsert({
        run_id: runId, sample_id: r.sampleId, transcript: r.transcript, payload: r.payload, validation_outcome: r.validationOutcome,
        stage_latency: r.stageLatencyMs, provenance: r.provenance ?? {}, error: r.error ?? null,
      }),
      "save lab result",
    );
  }
  async getLatestLabRun(): Promise<LabRun | null> {
    const run = check(await this.db.from("lab_runs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(), "get lab run") as
      | { id: string; label: string; status: LabRun["status"]; providers: LabRun["providers"]; created_at: string }
      | null;
    if (!run) return null;
    const rows = check(await this.db.from("lab_results").select("*").eq("run_id", run.id), "list lab results");
    return {
      id: run.id, label: run.label, createdAt: new Date(run.created_at).toISOString(), providers: run.providers, status: run.status,
      simulated: run.providers.stt.startsWith("mock"), source: "measured",
      results: ((rows ?? []) as LabResultRow[]).map(labResultFromRow),
    };
  }

  async listAudit() {
    const rows = check(await this.db.from("audit_events").select("*").order("created_at", { ascending: false }).order("seq", { ascending: false }), "list audit");
    return (rows as AuditRow[]).map(auditFromRow);
  }
}
