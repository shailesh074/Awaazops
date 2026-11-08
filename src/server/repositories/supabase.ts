import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent } from "@/domain";
import {
  OrderChangedError,
  type ConfirmedActionCommit,
  type OperationsRepository,
  type StoredAudio,
  type StoredPromptAudio,
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
} from "./supabase-mapping";

const RECORDINGS = "recordings";
const PROMPT_AUDIO = "prompt-audio";

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
  async listAudit() {
    const rows = check(await this.db.from("audit_events").select("*").order("created_at", { ascending: false }).order("seq", { ascending: false }), "list audit");
    return (rows as AuditRow[]).map(auditFromRow);
  }
}
