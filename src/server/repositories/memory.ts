import "server-only";
import type { AuditEvent, OperationalAction, Order, ReportDetail } from "@/domain";
import { AGENTS, ORDERS } from "@/mocks/fleet";
import { AUDIT_EVENTS, REPORTS } from "@/mocks/reports";
import type { OperationsRepository, StoredPromptAudio, StoredReport } from "./types";

interface MemoryState {
  orders: Map<string, Order>;
  reports: Map<string, StoredReport>;
  actions: Map<string, OperationalAction>;
  promptAudio: Map<string, StoredPromptAudio>;
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
state.promptAudio ??= new Map(); // stores created by an older build during dev hot reload

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
  async updateOrder(order: Order) {
    if (!state.orders.has(order.id)) throw new Error(`Unknown order ${order.id}`);
    state.orders.set(order.id, clone(order));
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

  async saveAction(action: OperationalAction) {
    state.actions.set(action.id, clone(action));
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
  async listAudit() {
    return clone([...state.audit].reverse());
  }
}
