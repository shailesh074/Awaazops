"use client";

import { Mic, RotateCcw, Square, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveWaveform } from "@/components/audio/live-waveform";
import { ClipPlayer } from "@/components/audio/clip-player";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { LANGUAGE_CODES, LANGUAGE_LABELS, type LanguageCode } from "@/domain";
import { AGENT_SCENARIOS } from "@/mocks/agent-scenarios";
import { MAX_RECORDING_MS, type useAudioRecorder } from "@/hooks/use-audio-recorder";

type Recorder = ReturnType<typeof useAudioRecorder>;

export function ComposeStep({
  language,
  onLanguage,
  recorder,
  scenarioId,
  onScenario,
  onSubmit,
}: {
  language: LanguageCode;
  onLanguage: (l: LanguageCode) => void;
  recorder: Recorder;
  scenarioId: string;
  onScenario: (id: string) => void;
  onSubmit: () => void;
}) {
  const { status, elapsedMs, audio, analyser, error } = recorder;
  const recording = status === "recording";

  return (
    <div className="space-y-5">
      {/* Language */}
      <fieldset>
        <legend className="mb-2 text-xs text-muted-foreground">Language</legend>
        <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-lg border bg-surface p-1">
          {LANGUAGE_CODES.map((code) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={language === code}
              onClick={() => onLanguage(code)}
              className={cn(
                "h-8 rounded-md text-sm transition-colors",
                language === code ? "bg-subtle text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {LANGUAGE_LABELS[code]}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Recorder */}
      <section className="rounded-2xl border bg-surface p-5" aria-label="Voice recorder">
        <div className="mb-4 flex items-center justify-between text-xs">
          <span className={cn("flex items-center gap-1.5", recording ? "text-destructive" : "text-muted-foreground")}>
            <span className={cn("size-1.5 rounded-full", recording ? "animate-pulse bg-destructive" : "bg-muted-foreground/50")} />
            {recording ? "Recording" : status === "stopped" ? "Recorded" : status === "requesting" ? "Waiting for microphone…" : "Ready"}
          </span>
          <span className="font-mono text-muted-foreground tabular">
            {formatDuration(elapsedMs)} / {formatDuration(MAX_RECORDING_MS)}
          </span>
        </div>

        {audio && status === "stopped" ? (
          <ClipPlayer url={audio.url} durationMs={audio.durationMs} className="mb-5 h-16" />
        ) : (
          <LiveWaveform analyser={recording ? analyser : null} className="mb-5" />
        )}

        <div className="flex items-center justify-center gap-4">
          {status === "stopped" ? (
            <Button variant="ghost" size="sm" onClick={recorder.reset}>
              <RotateCcw /> Re-record
            </Button>
          ) : (
            <button
              type="button"
              onClick={recording ? recorder.stop : recorder.start}
              disabled={status === "requesting"}
              aria-label={recording ? "Stop recording" : "Start recording"}
              className={cn(
                "relative grid size-20 place-items-center rounded-full transition-all focus-visible:ring-4 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                recording
                  ? "bg-destructive text-white"
                  : "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.97]",
              )}
            >
              {recording ? (
                <>
                  <span className="absolute inset-0 animate-ping rounded-full bg-destructive/30 [animation-duration:1.8s]" aria-hidden="true" />
                  <Square className="relative size-6 fill-current" />
                </>
              ) : (
                <Mic className="size-7" />
              )}
            </button>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {recording ? "Tap to stop" : status === "stopped" ? "Listen back, then send" : "Tap and describe the issue"}
        </p>

        {status === "denied" || status === "unsupported" || status === "error" ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/[0.06] px-3 py-2 text-xs text-warning">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {status === "unsupported"
              ? "This browser cannot record audio. You can still run a demo scenario below."
              : (error ?? "Recording failed.")}
          </p>
        ) : null}
      </section>

      {/* Demo scenario */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs text-muted-foreground">Demo scenario</h2>
          <span className="font-mono text-[10px] tracking-wider text-simulated uppercase">Simulated</span>
        </div>
        <p className="text-xs text-pretty text-muted-foreground">
          Gnani Prisma is not connected yet, so your recording is not transcribed. Pick the scripted outcome to
          walk through.
        </p>
        <div className="grid gap-1.5">
          {AGENT_SCENARIOS.map((s) => (
            <label
              key={s.id}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                scenarioId === s.id ? "border-primary/40 bg-primary/[0.06]" : "bg-surface hover:bg-surface-raised",
              )}
            >
              <span className="min-w-0">
                <span className="block text-sm">{s.label}</span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
              <input
                type="radio"
                name="scenario"
                value={s.id}
                checked={scenarioId === s.id}
                onChange={() => onScenario(s.id)}
                className="size-4 accent-[var(--primary)]"
              />
            </label>
          ))}
        </div>
      </section>

      <Button size="lg" className="h-11 w-full" onClick={onSubmit} disabled={recording || status === "requesting"}>
        {audio ? "Send report" : "Run demo scenario"}
      </Button>
    </div>
  );
}
