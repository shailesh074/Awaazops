"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Progress = { done: number; total: number; failed: number };

/** Starts a benchmark run and shows real progress streamed from the server. */
export function BenchmarkRunner({ storedSamples, sttLive, lastRun }: { storedSamples: number; sttLive: boolean; lastRun: string | null }) {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const running = progress !== null;

  const start = async () => {
    setProgress({ done: 0, total: storedSamples, failed: 0 });
    try {
      const res = await fetch("/api/lab/runs", { method: "POST" });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error?.message ?? `Request failed (${res.status})`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === "start") setProgress({ done: 0, total: msg.total, failed: 0 });
          if (msg.type === "sample") setProgress((p) => ({ done: msg.index, total: msg.total, failed: (p?.failed ?? 0) + (msg.ok ? 0 : 1) }));
          if (msg.type === "error") throw new Error(msg.error?.message ?? "Benchmark failed.");
          if (msg.type === "done") toast.success("Benchmark complete");
        }
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Benchmark failed.");
    } finally {
      setProgress(null);
    }
  };

  const disabledReason = !sttLive
    ? "Speech-to-text is simulated — configure Gnani Prisma to run the benchmark."
    : storedSamples === 0
      ? "Add at least one labelled sample first."
      : null;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        <span className="font-mono text-foreground tabular">{storedSamples}</span> stored sample{storedSamples === 1 ? "" : "s"}
        {lastRun ? <> · last run {lastRun}</> : null}
      </p>
      {running ? (
        <div className="space-y-1.5" aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <p className="font-mono text-xs text-muted-foreground tabular">
            {progress.done} / {progress.total} processed{progress.failed ? ` · ${progress.failed} failed` : ""}
          </p>
        </div>
      ) : null}
      <Button className="w-full" onClick={start} disabled={running || Boolean(disabledReason)}>
        {running ? <Loader2 className="animate-spin" /> : <Play />} {running ? "Running…" : "Run benchmark"}
      </Button>
      {disabledReason && !running ? <p className="text-xs text-muted-foreground">{disabledReason}</p> : null}
      <p className="text-xs text-pretty text-muted-foreground">
        Each clip goes through Gnani Prisma, the active reasoning engine and database verification. Every stage is
        timed; nothing is simulated.
      </p>
    </div>
  );
}
