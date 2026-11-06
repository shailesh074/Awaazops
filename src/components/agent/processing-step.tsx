"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMO_STAGES, type DemoStageId } from "@/lib/demo/pipeline";

export function ProcessingStep({ current }: { current: DemoStageId | null }) {
  const currentIndex = DEMO_STAGES.findIndex((s) => s.id === current);
  return (
    <section aria-live="polite" className="rounded-2xl border bg-surface p-5">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-medium">Processing report</h2>
        <span className="font-mono text-[10px] tracking-wider text-simulated uppercase">Simulated</span>
      </div>
      <ol className="space-y-4">
        {DEMO_STAGES.map((stage, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={stage.id} className="flex items-center gap-3">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-[11px]",
                  done && "border-primary/40 bg-primary/15 text-primary",
                  active && "border-primary/40 text-primary",
                  !done && !active && "text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
              </span>
              <span className={cn("text-sm", !done && !active && "text-muted-foreground")}>{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
