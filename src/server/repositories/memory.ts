import "server-only";
import type { AuditEvent, LabResult, LabRun, OperationalAction, Order, ReportDetail, StoredLabSample } from "@/domain";
import { AGENTS, ORDERS } from "@/mocks/fleet";
import { AUDIT_EVENTS, REPORTS } from "@/mocks/reports";
import {
  OrderChangedError,
  type ConfirmedActionCommit,
  type OperationsRepository,
  type StoredAudio,
  type StoredPromptAudio,
  type StoredLabRun,
  type StoredReport,
} from "./types";

interface MemoryState {
  orders: Map<string, Order>;
  reports: Map<string, StoredReport>;
  actions: Map<string, OperationalAction>;
  promptAudio: Map<string, StoredPromptAudio>;
  recordings: Map<string, StoredAudio>;
  labSamples: Map<string, StoredLabSample>;
  labAudio: Map<string, StoredAudio>;
  labRuns: Map<string, StoredLabRun>;
  labResults: Map<string, LabResult[]>;
  audit: AuditEvent[];
  seq: number;
  auditSeq: number;
}

function seed(): MemoryState {
  const reports = new Map<string, StoredReport>();
  const actions = new Map<string, OperationalAction>();
  for (const d of REPORTS) {
    reports.set(d.report.id, {
      report: d.report,
      transcript: d.transcript,
      extraction: d.extraction,
      validation: d.validation,
      actionId: d.action?.id ?? null,
      priority: d.priority,
      confirmationPrompt: d.confirmationPrompt,
    });
    if (d.action) actions.set(d.action.id, d.action);
  }
  return {
    orders: new Map(ORDERS.map((o) => [o.id, structuredClone(o)])),
    reports,
    actions,
    promptAudio: new Map(),
    recordings: new Map(),
    labSamples: new Map(),
    labAudio: new Map(),
    labRuns: new Map(),
    labResults: new Map(),
    audit: [...AUDIT_EVENTS].reverse(), // stored oldest → newest
    seq: 1042,
    auditSeq: 0,
  };
}

/**
 * Kept on globalThis so dev hot-reloads don't wipe it. It is per server process: data resets on restart
 * and is NOT shared between serverless instances — acceptable only until Supabase (step 8).
 */
const globalForStore = globalThis as unknown as { __awaazStore?: MemoryState };
const state = (globalForStore.__awaazStore ??= seed());
// Stores created by an older build survive dev hot reloads; add maps introduced since.
state.promptAudio ??= new Map();
state.recordings ??= new Map();
state.labSamples ??= new Map();
state.labAudio ??= new Map();
state.labRuns ??= new Map();
state.labResults ??= new Map();

const clone = <T,>(v: T): T => structuredClone(v);

export class MemoryRepository implements OperationsRepository {
  readonly kind = "memory" as const;

  async listAgents() {
    return clone(AGENTS);
  }
  async getAgent(id: string) {
    return clone(AGENTS.find((a) => a.id === id) ?? null);
  }

  async listOrders() {
    return clone([...state.orders.values()]);
  }
  async getOrder(id: string) {
    return clone(state.orders.get(id) ?? null);
  }

  private toDetail(s: StoredReport): ReportDetail {
    const agent = AGENTS.find((a) => a.id === s.report.agentId);
    if (!agent) throw new Error(`Report ${s.report.id} references unknown agent`);
    const orderId = s.validation?.resolvedOrderId ?? null;
    const audio = state.promptAudio.get(s.report.id);
    return clone({
      report: s.report,
      agent,
      transcript: s.transcript,
      extraction: s.extraction,
      validation: s.validation,
      order: orderId ? (state.orders.get(orderId) ?? null) : null,
      action: s.actionId ? (state.actions.get(s.actionId) ?? null) : null,
      priority: s.priority,
      confirmationPrompt: s.confirmationPrompt,
      // Only expose audio that was made from the prompt currently on the report.
      promptAudio: audio && audio.text === s.confirmationPrompt ? { provenance: audio.provenance } : null,
    });
  }

  async listReports() {
    return [...state.reports.values()].map((s) => this.toDetail(s));
  }
  async getReport(id: string) {
    const s = state.reports.get(id);
    return s ? this.toDetail(s) : null;
  }
  async getStoredReport(id: string) {
    return clone(state.reports.get(id) ?? null);
  }
  async saveReport(stored: StoredReport) {
    state.reports.set(stored.report.id, clone(stored));
  }
  async nextReportId() {
    state.seq += 1;
    return `R-${state.seq}`;
  }

  /** Same guards as the Postgres `commit_confirmed_action`; checks run before any write, so it is all-or-nothing. */
  async commitConfirmedAction(c: ConfirmedActionCommit) {
    const current = state.orders.get(c.order.id);
    if (!current || current.updatedAt !== c.expectedOrderUpdatedAt) throw new OrderChangedError(c.order.id);
    const report = state.reports.get(c.reportId);
    if (!report || report.report.status !== "CONFIRMED") throw new Error("REPORT_NOT_CONFIRMED");

    state.orders.set(c.order.id, clone(c.order));
    state.actions.set(c.action.id, clone(c.action));
    report.actionId = c.action.id;
    report.report = { ...report.report, status: "EXECUTED", timings: clone(c.timings), updatedAt: c.executedAt };
    for (const e of c.audit) await this.appendAudit(e);
  }

  async saveRecording(reportId: string, agentId: string, audio: StoredAudio) {
    const path = `${agentId}/${reportId}.${audio.mimeType.includes("wav") ? "wav" : "audio"}`;
    state.recordings.set(path, { data: audio.data.slice(0), mimeType: audio.mimeType });
    return path;
  }
  async getRecording(path: string) {
    const a = state.recordings.get(path);
    return a ? { data: a.data.slice(0), mimeType: a.mimeType } : null;
  }

  async savePromptAudio(reportId: string, audio: StoredPromptAudio) {
    state.promptAudio.set(reportId, { ...audio, data: audio.data.slice(0), provenance: clone(audio.provenance) });
  }
  async getPromptAudio(reportId: string) {
    const a = state.promptAudio.get(reportId);
    return a ? { ...a, data: a.data.slice(0), provenance: clone(a.provenance) } : null;
  }

  async appendAudit(event: Omit<AuditEvent, "id">) {
    state.auditSeq += 1;
    const stored: AuditEvent = { ...clone(event), id: `AE-${String(state.auditSeq).padStart(5, "0")}` };
    state.audit.push(stored);
    return clone(stored);
  }
  async listLabSamples() {
    return clone([...state.labSamples.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }
  async saveLabSample(sample: StoredLabSample, audio: StoredAudio) {
    state.labAudio.set(sample.audioPath, { data: audio.data.slice(0), mimeType: audio.mimeType });
    state.labSamples.set(sample.id, clone(sample));
  }
  async getLabAudio(path: string) {
    const a = state.labAudio.get(path);
    return a ? { data: a.data.slice(0), mimeType: a.mimeType } : null;
  }
  async saveLabRun(run: StoredLabRun) {
    state.labRuns.set(run.id, clone(run));
  }
  async saveLabResult(runId: string, result: LabResult) {
    const list = state.labResults.get(runId) ?? [];
    state.labResults.set(runId, [...list.filter((r) => r.sampleId !== result.sampleId), clone(result)]);
  }
  async getLatestLabRun(): Promise<LabRun | null> {
    const run = [...state.labRuns.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!run) return null;
    return clone({
      id: run.id, label: run.label, createdAt: run.createdAt, providers: run.providers, status: run.status,
      simulated: run.providers.stt.startsWith("mock"), source: "measured" as const,
      results: state.labResults.get(run.id) ?? [],
    });
  }

  async listAudit() {
    return clone([...state.audit].reverse());
  }
}
