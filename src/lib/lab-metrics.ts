import type { LabResult, LabSample, PipelineStage } from "@/domain";

/** Lowercase, strip punctuation, split on whitespace. Devanagari and Latin both survive. */
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Word error rate = word-level edit distance / reference length. */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const ref = tokens(reference);
  const hyp = tokens(hypothesis);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const cur = [i];
    for (let j = 1; j <= hyp.length; j++) {
      const sub = prev[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1);
      cur[j] = Math.min(sub, prev[j] + 1, cur[j - 1] + 1);
    }
    prev = cur;
  }
  return prev[hyp.length] / ref.length;
}

export interface DiffToken {
  text: string;
  /** same: in both · added: only in hypothesis · missing: only in reference */
  kind: "same" | "added" | "missing";
}

/** Word-level LCS diff between a reference and a hypothesis transcript (normalised tokens). */
export function diffWords(reference: string, hypothesis: string): DiffToken[] {
  const a = tokens(reference);
  const b = tokens(hypothesis);
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ text: b[j], kind: "same" });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ text: a[i++], kind: "missing" });
    } else {
      out.push({ text: b[j++], kind: "added" });
    }
  }
  while (i < a.length) out.push({ text: a[i++], kind: "missing" });
  while (j < b.length) out.push({ text: b[j++], kind: "added" });
  return out;
}

export const SCORED_FIELDS =["orderReference", "issue", "requestedAction", "clarification"] as const;
export type ScoredField = (typeof SCORED_FIELDS)[number];

export interface SampleScore {
  sampleId: string;
  wer: number;
  fields: Record<ScoredField, boolean>;
  correctCount: number;
  /** Wrong order extracted but verification refused to mark it VERIFIED. */
  caughtByVerification: boolean;
  /** Wrong order extracted AND verified — the failure the Reliability Engine must prevent. */
  unsafe: boolean;
  totalLatencyMs: number;
}

export function scoreSample(sample: LabSample, result: LabResult): SampleScore {
  const clarified = result.validationOutcome === "NEEDS_CLARIFICATION";
  const orderOk = result.payload.orderReference.value === sample.expected.orderReference;
  const fields: Record<ScoredField, boolean> = {
    orderReference: orderOk,
    issue: result.payload.issue.value === sample.expected.issue,
    requestedAction: result.payload.requestedAction.value === sample.expected.requestedAction,
    clarification: clarified === sample.expected.expectsClarification,
  };
  const wrongOrder = sample.expected.orderReference !== null && !orderOk;
  return {
    sampleId: sample.id,
    wer: wordErrorRate(sample.referenceTranscript, result.transcript),
    fields,
    correctCount: Object.values(fields).filter(Boolean).length,
    caughtByVerification: wrongOrder && result.validationOutcome !== "VERIFIED",
    unsafe: wrongOrder && result.validationOutcome === "VERIFIED",
    totalLatencyMs: Object.values(result.stageLatencyMs).reduce((a, b) => a + (b ?? 0), 0),
  };
}

export interface RunSummary {
  samples: number;
  meanWer: number;
  fieldAccuracy: Record<ScoredField, number>;
  exactMatchRate: number;
  unsafeUpdates: number;
  caughtByVerification: number;
  meanStageLatencyMs: Partial<Record<PipelineStage, number>>;
  p50TotalMs: number;
  maxTotalMs: number;
}

export function summarizeRun(scores: SampleScore[], results: LabResult[]): RunSummary {
  const n = scores.length || 1;
  const fieldAccuracy = Object.fromEntries(
    SCORED_FIELDS.map((f) => [f, scores.filter((s) => s.fields[f]).length / n]),
  ) as Record<ScoredField, number>;

  const stageTotals: Partial<Record<PipelineStage, { sum: number; count: number }>> = {};
  for (const r of results) {
    for (const [stage, ms] of Object.entries(r.stageLatencyMs) as [PipelineStage, number][]) {
      const t = (stageTotals[stage] ??= { sum: 0, count: 0 });
      t.sum += ms;
      t.count += 1;
    }
  }
  const meanStageLatencyMs = Object.fromEntries(
    Object.entries(stageTotals).map(([k, v]) => [k, v!.sum / v!.count]),
  ) as Partial<Record<PipelineStage, number>>;

  const totals = scores.map((s) => s.totalLatencyMs).sort((a, b) => a - b);

  return {
    samples: scores.length,
    meanWer: scores.reduce((a, s) => a + s.wer, 0) / n,
    fieldAccuracy,
    exactMatchRate: scores.filter((s) => s.correctCount === SCORED_FIELDS.length).length / n,
    unsafeUpdates: scores.filter((s) => s.unsafe).length,
    caughtByVerification: scores.filter((s) => s.caughtByVerification).length,
    meanStageLatencyMs,
    p50TotalMs: totals[Math.floor((totals.length - 1) / 2)] ?? 0,
    maxTotalMs: totals.at(-1) ?? 0,
  };
}
