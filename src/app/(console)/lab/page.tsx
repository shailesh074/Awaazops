import type { Metadata } from "next";
import { Gauge, Hash, ListChecks, ShieldCheck, Timer, Waves } from "lucide-react";
import { getProviderStatus } from "@/server/providers/status";
import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBanner } from "@/components/shared/demo-data-banner";
import { KpiGrid, KpiTile } from "@/components/shared/kpi-tile";
import { Panel } from "@/components/shared/panel";
import { BarList } from "@/components/shared/bar-list";
import { ProviderBadge } from "@/components/shared/provider-badge";
import { LabWorkbench, type LabRow } from "@/components/lab/lab-workbench";
import { AddSamplePanel } from "@/components/lab/add-sample-panel";
import { BenchmarkRunner } from "@/components/lab/benchmark-runner";
import { getLabView } from "@/server/data";
import { SCORED_FIELDS, scoreSample, summarizeRun, type ScoredField } from "@/lib/lab-metrics";
import { formatDateTime, formatMs, formatPercent } from "@/lib/format";
import type { NoiseLevel, ProviderId } from "@/domain";

export const metadata: Metadata = { title: "Intelligence Testing Lab" };

const FIELD_LABELS: Record<ScoredField, string> = {
  orderReference: "Order ID",
  issue: "Issue type",
  requestedAction: "Requested action",
  clarification: "Clarification decision",
};

const STAGE_LABEL = (s: string) => (s === "stt" ? "Speech-to-text" : s === "reasoning" ? "Reasoning" : s === "validation" ? "Validation" : s);

export default async function LabPage() {
  const view = await getLabView(); // authorises the dispatcher; reads at request time
  const { run, samples, source } = view;
  const measured = source === "measured";
  const stt = getProviderStatus().find((p) => p.stage === "stt");
  const sttLive = Boolean(stt && stt.kind === "ai" && stt.configured);

  const rows: LabRow[] = run.results.flatMap((result) => {
    const sample = samples.find((s) => s.id === result.sampleId);
    return sample ? [{ sample, result, score: scoreSample(sample, result) }] : [];
  });
  const summary = summarizeRun(rows.map((r) => r.score), rows.map((r) => r.result));

  const byNoise = (["clean", "moderate", "heavy"] as NoiseLevel[]).map((noise) => {
    const group = rows.filter((r) => r.sample.noise === noise);
    const exact = group.filter((r) => r.score.correctCount === SCORED_FIELDS.length).length;
    return { label: `${noise[0].toUpperCase()}${noise.slice(1)} audio`, value: group.length ? exact / group.length : 0, n: group.length };
  });

  const latencyTag = measured ? (
    <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Measured</span>
  ) : (
    <span className="font-mono text-[10px] tracking-wider text-simulated uppercase">Illustrative</span>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Testing Lab"
        description="How reliably AwaazOps turns realistic Indian speech into correct, verified actions."
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{run.id}</span>· {formatDateTime(run.createdAt)}
            <ProviderBadge provenance={{ provider: (measured ? run.providers.stt : "mock-stt") as ProviderId, simulated: run.simulated }} />
          </div>
        }
      />

      {measured ? null : (
        <DemoDataBanner>
          No benchmark has been run on stored samples yet, so this shows the scripted demo run: labelled demo clips
          with scripted outputs. Scores are real arithmetic over those outputs; latencies are illustrative. Add samples
          below and run the benchmark to replace it with measured results.
        </DemoDataBanner>
      )}

      <KpiGrid className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Samples" value={summary.samples} icon={Hash} hint={summary.failed ? `${summary.failed} failed to process` : "Hindi · English · Hinglish"} />
        <KpiTile
          label="Word error rate"
          value={summary.meanWer !== null ? formatPercent(summary.meanWer, 1) : "n/a"}
          icon={Waves}
          hint={summary.meanWer !== null ? `Mean over ${summary.werSamples} with a reference` : "No reference transcripts"}
        />
        <KpiTile label="Fully correct" value={formatPercent(summary.exactMatchRate)} icon={ListChecks} hint="All 4 fields right" />
        <KpiTile label="Order ID accuracy" value={formatPercent(summary.fieldAccuracy.orderReference)} icon={Gauge} hint="Before verification" />
        <KpiTile
          label="Unsafe updates"
          value={summary.unsafeUpdates}
          icon={ShieldCheck}
          emphasis
          hint={`${summary.caughtByVerification} wrong ID caught by verification`}
        />
        <KpiTile
          label="Median latency"
          value={summary.p50TotalMs ? formatMs(summary.p50TotalMs) : "—"}
          icon={Timer}
          hint={`Max ${formatMs(summary.maxTotalMs)} · ${measured ? "measured" : "illustrative"}`}
        />
      </KpiGrid>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Field accuracy" description="Share of samples where each field matched ground truth">
          <BarList
            ariaLabel="Accuracy by extracted field"
            max={1}
            data={SCORED_FIELDS.map((f) => ({ label: FIELD_LABELS[f], value: summary.fieldAccuracy[f], display: formatPercent(summary.fieldAccuracy[f]) }))}
          />
        </Panel>
        <Panel title="Robustness to noise" description="Fully-correct rate by recording condition">
          <BarList
            ariaLabel="Fully correct rate by noise level"
            max={1}
            data={byNoise.map((d) => ({ label: `${d.label} (${d.n})`, value: d.value, display: d.n ? formatPercent(d.value) : "—" }))}
          />
        </Panel>
        <Panel title="Latency by stage" description="Mean per sample" actions={latencyTag}>
          <BarList
            ariaLabel="Mean latency by pipeline stage"
            data={Object.entries(summary.meanStageLatencyMs).map(([stage, ms]) => ({ label: STAGE_LABEL(stage), value: ms ?? 0, display: formatMs(ms ?? 0) }))}
          />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="space-y-3 xl:col-span-2">
          <div>
            <h2 className="text-sm font-medium">Samples</h2>
            <p className="text-xs text-muted-foreground">Select a sample to inspect transcript, extraction and scoring.</p>
          </div>
          <LabWorkbench rows={rows} measured={measured} />
        </section>
        <div className="space-y-6">
          <Panel title="Benchmark" description="Run every stored sample through the real pipeline">
            <BenchmarkRunner storedSamples={view.storedSamples} sttLive={sttLive} lastRun={measured ? formatDateTime(run.createdAt) : null} />
          </Panel>
          <Panel title="Add test sample" description="Upload or record a clip and label what it should produce">
            <AddSamplePanel />
          </Panel>
        </div>
      </div>
    </div>
  );
}
