"use client";

import { useMemo, useState } from "react";
import { CircleCheck, ShieldCheck, TriangleAlert } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LANGUAGE_LABELS_SHORT } from "@/lib/labels";
import { formatMs, formatPercent } from "@/lib/format";
import { SCORED_FIELDS, type SampleScore } from "@/lib/lab-metrics";
import type { LabResult, LabSample, NoiseLevel } from "@/domain";
import { cn } from "@/lib/utils";
import { SampleDetail } from "./sample-detail";

type Filter = "all" | "failed" | "ambiguous" | NoiseLevel;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "failed", label: "Errors" },
  { id: "ambiguous", label: "Clarification" },
  { id: "clean", label: "Clean audio" },
  { id: "moderate", label: "Moderate noise" },
  { id: "heavy", label: "Heavy noise" },
];

const NOISE_DOTS: Record<NoiseLevel, number> = { clean: 1, moderate: 2, heavy: 3 };

export interface LabRow {
  sample: LabSample;
  result: LabResult;
  score: SampleScore;
}

export function LabWorkbench({ rows }: { rows: LabRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      rows.filter(({ sample, result, score }) => {
        if (filter === "all") return true;
        if (filter === "failed") return score.correctCount < SCORED_FIELDS.length;
        if (filter === "ambiguous") return result.validationOutcome === "NEEDS_CLARIFICATION";
        return sample.noise === filter;
      }),
    [rows, filter],
  );
  const current = rows.find((r) => r.sample.id === selected);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter samples">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "h-7 rounded-full border px-3 text-xs transition-colors",
              filter === f.id
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Sample</TableHead>
              <TableHead className="hidden md:table-cell">Language · accent</TableHead>
              <TableHead className="hidden sm:table-cell">Noise</TableHead>
              <TableHead className="text-right">WER</TableHead>
              <TableHead className="text-right">Fields</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Latency</TableHead>
              <TableHead className="pr-4">Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(({ sample, score }) => {
              const perfect = score.correctCount === SCORED_FIELDS.length;
              return (
                <TableRow
                  key={sample.id}
                  tabIndex={0}
                  onClick={() => setSelected(sample.id)}
                  onKeyDown={(e) => e.key === "Enter" && setSelected(sample.id)}
                  className="cursor-pointer focus-visible:bg-surface-raised focus-visible:outline-none"
                >
                  <TableCell className="pl-4">
                    <span className="block">{sample.title}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{sample.id}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {LANGUAGE_LABELS_SHORT[sample.language]} · <span className="text-muted-foreground">{sample.accent}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="inline-flex items-center gap-1.5 text-xs capitalize" title={`${sample.noise} noise`}>
                      <span className="flex gap-0.5" aria-hidden="true">
                        {[1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className={cn("size-1.5 rounded-full", i <= NOISE_DOTS[sample.noise] ? "bg-foreground/70" : "bg-foreground/15")}
                          />
                        ))}
                      </span>
                      {sample.noise}
                    </span>
                  </TableCell>
                  <TableCell className={cn("text-right font-mono text-xs tabular", score.wer > 0 && "text-warning")}>
                    {formatPercent(score.wer, 1)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular">
                    {score.correctCount}/{SCORED_FIELDS.length}
                  </TableCell>
                  <TableCell className="hidden text-right font-mono text-xs text-muted-foreground tabular lg:table-cell">
                    {formatMs(score.totalLatencyMs)}
                  </TableCell>
                  <TableCell className="pr-4">
                    {score.caughtByVerification ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <ShieldCheck className="size-3.5" /> Caught
                      </span>
                    ) : perfect ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CircleCheck className="size-3.5 text-success" /> Pass
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-warning">
                        <TriangleAlert className="size-3.5" /> Mismatch
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!current} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="px-6 pt-6 pb-0">
            <SheetTitle>Sample inspection</SheetTitle>
          </SheetHeader>
          <div className="px-6 pb-8">
            {current ? <SampleDetail sample={current.sample} result={current.result} score={current.score} /> : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
