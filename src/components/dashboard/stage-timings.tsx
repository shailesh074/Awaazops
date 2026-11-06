import type { StageTiming } from "@/domain";
import { BarList } from "@/components/shared/bar-list";
import { formatMs } from "@/lib/format";

const LABELS: Record<StageTiming["stage"], string> = {
  stt: "Speech-to-text",
  reasoning: "Reasoning",
  validation: "Validation",
  tts: "Voice prompt",
  execution: "Execution",
};

export function StageTimings({ timings }: { timings: StageTiming[] }) {
  const total = timings.reduce((a, t) => a + t.latencyMs, 0);
  return (
    <div className="space-y-3">
      <BarList
        ariaLabel="Latency by pipeline stage"
        data={timings.map((t) => ({ label: LABELS[t.stage], value: t.latencyMs, display: formatMs(t.latencyMs) }))}
      />
      <p className="flex justify-between border-t pt-2 text-xs text-muted-foreground">
        <span>Total</span>
        <span className="font-mono text-foreground tabular">{formatMs(total)}</span>
      </p>
    </div>
  );
}
