import type { Metadata } from "next";
import { Gauge, Hash, ListChecks, ShieldCheck, Timer, Waves } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBanner } from "@/components/shared/demo-data-banner";
import { KpiGrid, KpiTile } from "@/components/shared/kpi-tile";
import { Panel } from "@/components/shared/panel";
import { BarList } from "@/components/shared/bar-list";
import { ProviderBadge } from "@/components/shared/provider-badge";
import { LabWorkbench, type LabRow } from "@/components/lab/lab-workbench";
import { AddSamplePanel } from "@/components/lab/add-sample-panel";
import { getLatestLabRun, listLabSamples } from "@/server/data";
import { SCORED_FIELDS, scoreSample, summarizeRun, type ScoredField } from "@/lib/lab-metrics";
import { formatDateTime, formatMs, formatPercent } from "@/lib/format";
import type { NoiseLevel } from "@/domain";

export const metadata: Metadata = { title: "Intelligence Testing Lab" };

const FIELD_LABELS: Record<ScoredField, string> = {
  orderReference: "Order ID",
  issue: "Issue type",
  requestedAction: "Requested action",
  clarification: "Clarification decision",
};

export default async function LabPage() {
  const [samples, run] = await Promise.all([listLabSamples(), getLatestLabRun()]);
  if (!run) {
    return <PageHeader eyebrow="Intelligence" title="Testing Lab" description="No runs yet." />;
  }

  const rows: LabRow[] = run.results.flatMap((result) => {
    const sample = samples.find((s) => s.id === result.sampleId);
    return sample ? [{ sample, result, score: scoreSample(sample, result) }] : [];
  });
  const summary = summarizeRun(
    rows.map((r) => r.score),
    rows.map((r) => r.result),
  );

  const byNoise = (["clean", "moderate", "heavy"] as NoiseLevel[]).map((noise) => {
    const group = rows.filter((r) => r.sample.noise === noise);
    const exact = group.filter((r) => r.score.correctCount === SCORED_FIELDS.length).length;
    return { label: `${noise[0].toUpperCase()}${noise.slice(1)} audio`, value: group.length ? exact / group.length : 0, n: group.length };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Testing Lab"
        description="How reliably AwaazOps turns realistic Indian speech into correct, verified actions."
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{run.id}</span>· {formatDateTime(run.createdAt)}
            <ProviderBadge provenance={{ provider: "mock-stt", simulated: run.simulated }} />
          </div>
        }
      />
      <DemoDataBanner>
        This run uses labelled demo samples and scripted mock outputs. Scores are computed for real against the
        ground-truth labels; latencies are illustrative. Real numbers arrive once Gnani Prisma and the LLM are
        connected.
      </DemoDataBanner>

      <KpiGrid className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Samples" value={summary.samples} icon={Hash} hint="Hindi · English · Hinglish" />
        <KpiTile label="Word error rate" value={formatPercent(summary.meanWer, 1)} icon={Waves} hint="Mean, vs. reference" />
        <KpiTile label="Fully correct" value={formatPercent(summary.exactMatchRate)} icon={ListChecks} hint="All 4 fields right" />
        <KpiTile label="Order ID accuracy" value={formatPercent(summary.fieldAccuracy.orderReference)} icon={Gauge} hint="Before verification" />
        <KpiTile
          label="Unsafe updates"
          value={summary.unsafeUpdates}
          icon={ShieldCheck}
          emphasis
          hint={`${summary.caughtByVerification} wrong ID caught by verification`}
        />
        <KpiTile label="Median latency" value={formatMs(summary.p50TotalMs)} icon={Timer} hint={`Max ${formatMs(summary.maxTotalMs)} · illustrative`} />
      </KpiGrid>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Field accuracy" description="Share of samples where each field matched ground truth">
          <BarList
            ariaLabel="Accuracy by extracted field"
            max={1}
            data={SCORED_FIELDS.map((f) => ({
              label: FIELD_LABELS[f],
              value: summary.fieldAccuracy[f],
              display: formatPercent(summary.fieldAccuracy[f]),
            }))}
          />
        </Panel>
        <Panel title="Robustness to noise" description="Fully-correct rate by recording condition">
          <BarList
            ariaLabel="Fully correct rate by noise level"
            max={1}
            data={byNoise.map((d) => ({ label: `${d.label} (${d.n})`, value: d.value, display: formatPercent(d.value) }))}
          />
        </Panel>
        <Panel
          title="Latency by stage"
          description="Mean per sample"
          actions={<span className="font-mono text-[10px] tracking-wider text-simulated uppercase">Illustrative</span>}
        >
          <BarList
            ariaLabel="Mean latency by pipeline stage"
            data={Object.entries(summary.meanStageLatencyMs).map(([stage, ms]) => ({
              label: stage === "stt" ? "Speech-to-text" : stage === "reasoning" ? "Reasoning" : "Validation",
              value: ms ?? 0,
              display: formatMs(ms ?? 0),
            }))}
          />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="space-y-3 xl:col-span-2">
          <div>
            <h2 className="text-sm font-medium">Samples</h2>
            <p className="text-xs text-muted-foreground">Select a sample to inspect transcript, extraction and scoring.</p>
          </div>
          <LabWorkbench rows={rows} />
        </section>
        <Panel title="Add test sample" description="Upload or record a clip and label it">
          <AddSamplePanel />
        </Panel>
      </div>
    </div>
  );
}
