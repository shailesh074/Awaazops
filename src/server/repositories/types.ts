import "server-only";
import type {
  Agent,
  AuditEvent,
  Extraction,
  LabResult,
  LabRun,
  OperationalAction,
  StoredLabSample,
  Order,
  Priority,
  Provenance,
  ReportDetail,
  StageTiming,
  Transcript,
  ValidationResult,
  VoiceReport,
} from "@/domain";

/** A report and the artefacts produced for it, as stored (joined into ReportDetail on read). */
export interface StoredReport {
  report: VoiceReport;
  transcript: Transcript | null;
  extraction: Extraction | null;
  validation: ValidationResult | null;
  actionId: string | null;
  priority: Priority;
  confirmationPrompt: string | null;
}

/** Synthesized speech for a report's current prompt. `text` ties the audio to the prompt it was made from. */
export interface StoredPromptAudio {
  data: ArrayBuffer;
  mimeType: string;
  text: string;
  provenance: Provenance;
}

export interface StoredAudio {
  data: ArrayBuffer;
  mimeType: string;
}

/** Everything that changes when a confirmed action executes — applied atomically. */
export interface ConfirmedActionCommit {
  reportId: string;
  timings: StageTiming[];
  executedAt: string;
  action: OperationalAction;
  /** The order as it should be after the action. */
  order: Order;
  /** The order's `updatedAt` when it was read; the commit fails if it changed since. */
  expectedOrderUpdatedAt: string;
  audit: Array<Omit<AuditEvent, "id">>;
}

/** The order was modified between verification and execution; nothing was written. */
export class OrderChangedError extends Error {
  constructor(orderId: string) {
    super(`Order ${orderId} changed before the action could be applied.`);
    this.name = "OrderChangedError";
  }
}

/**
 * Persistence boundary. Implementations: in-memory (demo) and Supabase. All methods are async.
 * Read methods respect the caller's visibility when the repository is user-scoped (Supabase RLS).
 */
export interface OperationsRepository {
  readonly kind: "memory" | "supabase";

  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;

  listOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;

  listReports(): Promise<ReportDetail[]>;
  getReport(id: string): Promise<ReportDetail | null>;
  getStoredReport(id: string): Promise<StoredReport | null>;
  saveReport(stored: StoredReport): Promise<void>;
  nextReportId(): Promise<string>;

  /** Atomically applies a confirmed action. Throws OrderChangedError if the order moved on. */
  commitConfirmedAction(commit: ConfirmedActionCommit): Promise<void>;

  /** Audio for the report's current prompt. */
  savePromptAudio(reportId: string, audio: StoredPromptAudio): Promise<void>;
  getPromptAudio(reportId: string): Promise<StoredPromptAudio | null>;

  /** The agent's original recording; returns the storage path recorded on the report. */
  saveRecording(reportId: string, agentId: string, audio: StoredAudio): Promise<string>;
  getRecording(path: string): Promise<StoredAudio | null>;

  /** Append-only. */
  appendAudit(event: Omit<AuditEvent, "id">): Promise<AuditEvent>;
  listAudit(): Promise<AuditEvent[]>;

  // ── Intelligence Testing Lab ──
  listLabSamples(): Promise<StoredLabSample[]>;
  saveLabSample(sample: StoredLabSample, audio: StoredAudio): Promise<void>;
  getLabAudio(path: string): Promise<StoredAudio | null>;
  saveLabRun(run: StoredLabRun): Promise<void>;
  saveLabResult(runId: string, result: LabResult): Promise<void>;
  /** Most recent measured run with its results, or null if none exists yet. */
  getLatestLabRun(): Promise<LabRun | null>;
}

export interface StoredLabRun {
  id: string;
  label: string;
  status: LabRun["status"];
  providers: LabRun["providers"];
  sampleCount: number;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
}
