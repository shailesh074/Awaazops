"use client";

import { CircleCheck, CircleX, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EvidenceInspector } from "@/components/shared/evidence-inspector";
import { JsonView } from "@/components/shared/json-view";
import { OutcomePill } from "@/components/shared/status-pill";
import { BarList } from "@/components/shared/bar-list";
import type { LabResult, LabSample } from "@/domain";
import { diffWords, type SampleScore, type ScoredField } from "@/lib/lab-metrics";
import { ACTION_LABELS, ISSUE_LABELS } from "@/lib/labels";
import { formatMs, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const FIELD_NAMES: Record<ScoredField, string> = {
  orderReference: "Order ID",
  issue: "Issue",
  requestedAction: "Action",
  clarification: "Asked to clarify",
};

function expectedValue(sample: LabSample, f: ScoredField): string {
  const e = sample.expected;
  if (f === "orderReference") return e.orderReference ?? "— (none spoken)";
  if (f === "issue") return e.issue ? ISSUE_LABELS[e.issue] : "—";
  if (f === "requestedAction") return e.requestedAction ? ACTION_LABELS[e.requestedAction] : "—";
  return e.expectsClarification ? "Yes" : "No";
}

function actualValue(result: LabResult, f: ScoredField): string {
  const p = result.payload;
  if (f === "orderReference") return p.orderReference.value ?? "—";
  if (f === "issue") return p.issue.value ? ISSUE_LABELS[p.issue.value] : "—";
  if (f === "requestedAction") return p.requestedAction.value ? ACTION_LABELS[p.requestedAction.value] : "—";
  return result.validationOutcome === "NEEDS_CLARIFICATION" ? "Yes" : "No";
}

export function SampleDetail({ sample, result, score }: { sample: LabSample; result: LabResult; score: SampleScore }) {
  const diff = diffWords(sample.referenceTranscript, result.transcript);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{sample.id}</span>
        <h3 className="text-sm font-medium">{sample.title}</h3>
        <OutcomePill outcome={result.validationOutcome} />
      </div>

      {score.caughtByVerification ? (
        <p className="flex items-start gap-2 rounded-lg border border-success/25 bg-success/[0.06] px-3 py-2 text-xs text-success">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />
          Speech-to-text misheard the order ID, but verification found no such order and asked the agent instead of
          updating the wrong one.
        </p>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h4 className="text-xs text-muted-foreground">Transcript vs. reference</h4>
          <span className="font-mono text-xs tabular">WER {formatPercent(score.wer, 1)}</span>
        </div>
        <p className="rounded-lg border bg-background/60 p-3 font-mono text-[13px] leading-6">
          {diff.map((t, i) => (
            <span
              key={i}
              className={cn(
                t.kind === "added" && "rounded bg-destructive/15 px-0.5 text-destructive",
                t.kind === "missing" && "text-muted-foreground line-through decoration-destructive/70",
              )}
              title={t.kind === "added" ? "Not in reference" : t.kind === "missing" ? "Missing from transcript" : undefined}
            >
              {t.text}{" "}
            </span>
          ))}
        </p>
        <p className="text-[11px] text-muted-foreground">
          <span className="text-destructive">Red</span>: inserted or substituted ·{" "}
          <span className="line-through">struck</span>: missed
        </p>
      </section>

      <section>
        <h4 className="mb-2 text-xs text-muted-foreground">Field scoring</h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-1.5 font-normal">Field</th>
              <th className="pb-1.5 font-normal">Expected</th>
              <th className="pb-1.5 font-normal">Extracted</th>
              <th className="w-8 pb-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y border-t">
            {(Object.keys(FIELD_NAMES) as ScoredField[]).map((f) => (
              <tr key={f}>
                <td className="py-2 text-xs text-muted-foreground">{FIELD_NAMES[f]}</td>
                <td className="py-2">{expectedValue(sample, f)}</td>
                <td className={cn("py-2", !score.fields[f] && "text-destructive")}>{actualValue(result, f)}</td>
                <td className="py-2">
                  {score.fields[f] ? (
                    <CircleCheck className="size-4 text-success" aria-label="Correct" />
                  ) : (
                    <CircleX className="size-4 text-destructive" aria-label="Incorrect" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Tabs defaultValue="evidence">
        <TabsList>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
          <TabsTrigger value="latency">Latency</TabsTrigger>
        </TabsList>
        <TabsContent value="evidence" className="pt-3">
          <EvidenceInspector transcript={result.transcript} payload={result.payload} />
        </TabsContent>
        <TabsContent value="json" className="pt-3">
          <JsonView value={result.payload} className="max-h-96" />
        </TabsContent>
        <TabsContent value="latency" className="pt-3">
          <BarList
            ariaLabel="Latency by stage for this sample"
            data={Object.entries(result.stageLatencyMs).map(([k, v]) => ({
              label: k === "stt" ? "Speech-to-text" : k === "reasoning" ? "Reasoning" : "Validation",
              value: v ?? 0,
              display: formatMs(v ?? 0),
            }))}
          />
          <p className="mt-3 text-xs text-simulated">Illustrative values — not measured.</p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
