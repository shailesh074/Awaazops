import type { Agent, Order, Priority } from "./orders";
import type { Extraction } from "./extraction";
import type { ValidationResult } from "./validation";
import type { OperationalAction, Transcript, VoiceReport } from "./reports";
import type { LanguageCode } from "./language";
import type { ExtractionPayload } from "./extraction";
import type { PipelineStage } from "./reports";

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
}

export interface DashboardSummary {
  totalOrders: number;
  pendingExceptions: number;
  completedActions: number;
  failedDeliveries: number;
  rescheduled: number;
  needsClarification: number;
}

export type NoiseLevel = "clean" | "moderate" | "heavy";

/** A labelled test case for the Intelligence Testing Lab. */
export interface LabSample {
  id: string;
  title: string;
  language: LanguageCode;
  accent: string;
  noise: NoiseLevel;
  durationMs: number;
  referenceTranscript: string;
  /** Ground-truth values for scored fields. */
  expected: {
    orderReference: string | null;
    issue: ExtractionPayload["issue"]["value"];
    requestedAction: ExtractionPayload["requestedAction"]["value"];
    expectsClarification: boolean;
  };
}

export interface LabResult {
  sampleId: string;
  transcript: string;
  payload: ExtractionPayload;
  validationOutcome: ValidationResult["outcome"];
  stageLatencyMs: Partial<Record<PipelineStage, number>>;
  simulated: boolean;
}

export interface LabRun {
  id: string;
  label: string;
  createdAt: string;
  providers: { stt: string; reasoning: string };
  simulated: boolean;
  results: LabResult[];
}
