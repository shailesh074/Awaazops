"use client";

import { Check, Loader2 } from "lucide-react";
import type { PipelineStage } from "@/domain";
import { formatMs } from "@/lib/format";
import { cn } from "@/lib/utils";

export const PIPELINE_STEPS: Array<{ id: PipelineStage; label: string }> = [
  { id: "stt", label: "Transcribing speech" },
  { id: "reasoning", label: "Understanding the report" },
  { id: "validation", label: "Verifying against orders" },
  { id: "tts", label: "Preparing response" },
];

export type StageProgress = Partial<Record<PipelineStage, { done: boolean; latencyMs?: number }>>;

/** Live progress streamed from the server — each tick is a stage that actually started or finished. */
export function ProcessingStep({ progress }: { progress: StageProgress }) {
  return (
    <section aria-live="polite" className="rounded-2xl border bg-surface p-5">
      <h2 className="mb-5 text-sm font-medium">Processing report</h2>
      <ol className="space-y-4">
        {PIPELINE_STEPS.map((step, i) => {
          const p = progress[step.id];
          const done = p?.done;
          const active = p && !p.done;
          return (
            <li key={step.id} className="flex items-center gap-3">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-[11px]",
                  done && "border-primary/40 bg-primary/15 text-primary",
                  active && "border-primary/40 text-primary",
                  !p && "text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
              </span>
              <span className={cn("flex-1 text-sm", !p && "text-muted-foreground")}>{step.label}</span>
              {done && p.latencyMs !== undefined ? (
                <span className="font-mono text-[11px] text-muted-foreground tabular">{formatMs(p.latencyMs)}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
