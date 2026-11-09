import type { ExtractionPayload } from "./extraction";
import type { LanguageCode } from "./language";
import type { Provenance } from "./provenance";
import type { PipelineStage } from "./reports";
import type { ValidationResult } from "./validation";

export type NoiseLevel = "clean" | "moderate" | "heavy";

/** A labelled test case for the Intelligence Testing Lab. */
export interface LabSample {
  id: string;
  title: string;
  language: LanguageCode;
  accent: string;
  noise: NoiseLevel;
  durationMs: number;
  /** What was actually said. Null → word error rate is not computed for this sample (never invented). */
  referenceTranscript: string | null;
  /** Ground-truth values for scored fields. */
  expected: {
    /** Order digits, or null when no order is spoken in the clip. */
    orderReference: string | null;
    issue: ExtractionPayload["issue"]["value"];
    requestedAction: ExtractionPayload["requestedAction"]["value"];
    expectsClarification: boolean;
  };
}

export interface StoredLabSample extends LabSample {
  audioPath: string;
  mimeType: string;
  createdBy: string;
  createdAt: string;
}

export interface LabResult {
  sampleId: string;
  transcript: string;
  /** Null when the sample could not be processed (see `error`). */
  payload: ExtractionPayload | null;
  validationOutcome: ValidationResult["outcome"] | null;
  stageLatencyMs: Partial<Record<PipelineStage, number>>;
  simulated: boolean;
  /** Why the sample failed (speech-to-text error, no speech…). Null on success. */
  error?: string | null;
  provenance?: { stt?: Provenance; reasoning?: Provenance };
}

export interface LabRun {
  id: string;
  label: string;
  createdAt: string;
  providers: { stt: string; reasoning: string };
  simulated: boolean;
  /** "measured": a real run over stored samples; "demo": the scripted fixture run. */
  source: "measured" | "demo";
  status: "running" | "completed" | "failed";
  results: LabResult[];
}
