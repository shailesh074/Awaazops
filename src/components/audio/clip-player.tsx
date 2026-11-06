"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";

const BARS = 56;

async function computePeaks(url: string): Promise<number[]> {
  const buf = await (await fetch(url)).arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const size = Math.floor(data.length / BARS) || 1;
    const peaks = Array.from({ length: BARS }, (_, i) => {
      let max = 0;
      for (let j = i * size; j < Math.min(data.length, (i + 1) * size); j++) max = Math.max(max, Math.abs(data[j]));
      return max;
    });
    const top = Math.max(0.01, ...peaks);
    return peaks.map((p) => p / top);
  } finally {
    void ctx.close();
  }
}

/** Playback for a recorded clip with a static waveform that fills as it plays. */
export function ClipPlayer({ url, durationMs, className }: { url: string; durationMs: number; className?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    computePeaks(url)
      .then((p) => !cancelled && setPeaks(p))
      .catch(() => !cancelled && setPeaks(Array(BARS).fill(0.25)));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        onClick={toggle}
        aria-label={playing ? "Pause recording" : "Play recording"}
        className="size-9 shrink-0 rounded-full"
      >
        {playing ? <Pause /> : <Play className="translate-x-px" />}
      </Button>
      <div className="flex h-9 flex-1 items-center gap-[2px]" aria-hidden="true">
        {(peaks ?? Array(BARS).fill(0.15)).map((p, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-full transition-colors",
              i / BARS < progress ? "bg-primary" : "bg-foreground/20",
            )}
            style={{ height: `${Math.max(8, p * 100)}%` }}
          />
        ))}
      </div>
      <span className="w-10 text-right font-mono text-xs text-muted-foreground tabular">
        {formatDuration(durationMs)}
      </span>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          const total = Number.isFinite(a.duration) ? a.duration : durationMs / 1000;
          setProgress(total ? a.currentTime / total : 0);
        }}
      />
    </div>
  );
}
