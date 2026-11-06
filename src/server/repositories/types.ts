import "server-only";
import type {
  Agent,
  AuditEvent,
  Extraction,
  OperationalAction,
  Order,
  Priority,
  ReportDetail,
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

/**
 * Persistence boundary. The in-memory implementation is used until Supabase lands (step 8);
 * the Supabase implementation will satisfy the same interface. All methods are async for that reason.
 */
export interface OperationsRepository {
  readonly kind: "memory" | "supabase";

  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;

  listOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  updateOrder(order: Order): Promise<void>;

  listReports(): Promise<ReportDetail[]>;
  getReport(id: string): Promise<ReportDetail | null>;
  getStoredReport(id: string): Promise<StoredReport | null>;
  saveReport(stored: StoredReport): Promise<void>;
  nextReportId(): Promise<string>;

  saveAction(action: OperationalAction): Promise<void>;

  /** Append-only. */
  appendAudit(event: Omit<AuditEvent, "id">): Promise<AuditEvent>;
  listAudit(): Promise<AuditEvent[]>;
}
