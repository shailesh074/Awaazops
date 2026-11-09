import type { Agent, Order, Priority } from "./orders";
import type { Extraction } from "./extraction";
import type { ValidationResult } from "./validation";
import type { OperationalAction, Transcript, VoiceReport } from "./reports";
import type { LanguageCode } from "./language";
import type { ExtractionPayload } from "./extraction";
import type { PipelineStage } from "./reports";
import type { Provenance } from "./provenance";

/** Everything known about one voice report, as the UI consumes it. */
export interface ReportDetail {
  report: VoiceReport;
  agent: Agent;
  transcript: Transcript | null;
  extraction: Extraction | null;
  validation: ValidationResult | null;
  order: Order | null;
  action: OperationalAction | null;
  priority: Priority;
  /** Text the system spoke (or would speak) back to the agent. */
  confirmationPrompt: string | null;
  /** Present when synthesized audio exists for the current prompt (served by /api/reports/:id/prompt-audio). */
  promptAudio: { provenance: Provenance } | null;
}

export interface DashboardSummary {
  totalOrders: number;
  pendingExceptions: number;
  completedActions: number;
  failedDeliveries: number;
  rescheduled: number;
  needsClarification: number;
}
