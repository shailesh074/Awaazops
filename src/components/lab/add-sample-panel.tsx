"use client";

import { useRef, useState } from "react";
import { Loader2, Mic, Play, Square, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipPlayer } from "@/components/audio/clip-player";
import { LiveWaveform } from "@/components/audio/live-waveform";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { LANGUAGE_CODES, type LanguageCode, type NoiseLevel } from "@/domain";
import { LANGUAGE_LABELS_SHORT } from "@/lib/labels";
import { formatDuration, formatMs, formatPercent } from "@/lib/format";
import { wordErrorRate } from "@/lib/lab-metrics";
import { toWav16kMono } from "@/lib/audio/to-wav";

type RunState =
  | { state: "running" }
  | { state: "done"; transcript: string; wer: number | null; latencyMs: number; model?: string }
  | { state: "error"; message: string };

interface QueuedSample {
  id: string;
  name: string;
  url: string;
  blob: Blob;
  durationMs: number;
  language: LanguageCode;
  accent: string;
  noise: NoiseLevel;
  reference: string;
  run?: RunState;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Converts to WAV, sends to the lab STT endpoint, and scores against the reference. */
async function transcribeSample(s: QueuedSample): Promise<RunState> {
  try {
    const wav = await toWav16kMono(s.blob);
    if (wav.durationMs > 30_500) throw new Error("Prisma accepts clips up to 30 seconds.");
    const form = new FormData();
    form.set("audio", wav.blob, "sample.wav");
    form.set("language", s.language);
    form.set("durationMs", String(Math.round(wav.durationMs)));
    const t0 = performance.now();
    const res = await fetch("/api/lab/transcribe", { method: "POST", body: form });
    const latencyMs = performance.now() - t0;
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
    return {
      state: "done",
      transcript: body.transcript,
      wer: s.reference ? wordErrorRate(s.reference, body.transcript) : null,
      latencyMs,
      model: body.provenance?.model,
    };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : "Transcription failed." };
  }
}

/**
 * Collects test clips in the browser and, when Gnani Prisma is live, transcribes them for real:
 * transcript, WER against the reference, measured latency. Results are not persisted yet (step 8).
 */
export function AddSamplePanel({ sttLive }: { sttLive: boolean }) {
  const recorder = useAudioRecorder();
  const fileRef = useRef<HTMLInputElement>(null);
  const [clip, setClip] = useState<{ name: string; url: string; durationMs: number; blob: Blob } | null>(null);
  const [language, setLanguage] = useState<LanguageCode>("hi-en");
  const [noise, setNoise] = useState<NoiseLevel>("moderate");
  const [accent, setAccent] = useState("");
  const [reference, setReference] = useState("");
  const [queue, setQueue] = useState<QueuedSample[]>([]);

  const activeClip =
    clip ??
    (recorder.audio
      ? { name: "Recording", url: recorder.audio.url, durationMs: recorder.audio.durationMs, blob: recorder.audio.blob }
      : null);

  const update = (id: string, run: RunState) => setQueue((q) => q.map((s) => (s.id === id ? { ...s, run } : s)));

  const runSample = async (s: QueuedSample) => {
    update(s.id, { state: "running" });
    update(s.id, await transcribeSample(s));
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) return toast.error("Choose an audio file.");
    if (file.size > MAX_UPLOAD_BYTES) return toast.error("Audio must be 10 MB or smaller.");
    const url = URL.createObjectURL(file);
    const probe = new Audio(url);
    probe.onloadedmetadata = () =>
      setClip({ name: file.name, url, blob: file, durationMs: Number.isFinite(probe.duration) ? probe.duration * 1000 : 0 });
    probe.onerror = () => toast.error("This audio format could not be read by the browser.");
  };

  const clear = () => {
    setClip(null);
    recorder.reset();
    if (fileRef.current) fileRef.current.value = "";
  };

  const queueSample = () => {
    if (!activeClip) return;
    setQueue((q) => [
      {
        id: `NEW-${q.length + 1}`,
        name: activeClip.name,
        url: activeClip.url,
        blob: activeClip.blob,
        durationMs: activeClip.durationMs,
        language,
        accent: accent.trim() || "Unspecified",
        noise,
        reference: reference.trim(),
      },
      ...q,
    ]);
    setClip(null);
    setAccent("");
    setReference("");
    toast.success("Sample queued locally");
  };

  return (
    <div className="space-y-4">
      {activeClip ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background/60 p-3">
          <ClipPlayer url={activeClip.url} durationMs={activeClip.durationMs} className="flex-1" />
          <Button variant="ghost" size="icon" onClick={clear} aria-label="Remove clip">
            <X />
          </Button>
        </div>
      ) : recorder.status === "recording" ? (
        <div className="flex items-center gap-3 rounded-lg border bg-background/60 p-3">
          <LiveWaveform analyser={recorder.analyser} className="h-10 flex-1" />
          <span className="font-mono text-xs tabular">{formatDuration(recorder.elapsedMs)}</span>
          <Button size="sm" variant="destructive" onClick={recorder.stop}>
            <Square className="fill-current" /> Stop
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload /> Upload audio
          </Button>
          <Button variant="secondary" onClick={recorder.start} disabled={recorder.status === "requesting"}>
            <Mic /> Record
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="sr-only"
            aria-label="Upload audio sample"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
      )}
      {recorder.error ? <p className="text-xs text-warning">{recorder.error}</p> : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="lab-lang">Language</Label>
          <Select value={language} onValueChange={(v) => setLanguage(v as LanguageCode)}>
            <SelectTrigger id="lab-lang" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_CODES.map((l) => (
                <SelectItem key={l} value={l}>
                  {LANGUAGE_LABELS_SHORT[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lab-noise">Noise</Label>
          <Select value={noise} onValueChange={(v) => setNoise(v as NoiseLevel)}>
            <SelectTrigger id="lab-noise" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clean">Clean</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="heavy">Heavy</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lab-accent">Accent / region</Label>
        <Input id="lab-accent" value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="e.g. Patna, Bhojpuri-influenced" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lab-ref">Reference transcript</Label>
        <Textarea
          id="lab-ref"
          rows={2}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="What was actually said — used to compute word error rate"
        />
      </div>
      <Button className="w-full" onClick={queueSample} disabled={!activeClip}>
        Add to test set
      </Button>

      {queue.length ? (
        <ul className="divide-y rounded-lg border">
          {queue.map((s) => (
            <li key={s.id} className="space-y-2 px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate">{s.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {LANGUAGE_LABELS_SHORT[s.language]} · {s.accent} · {s.noise} · {formatDuration(s.durationMs)}
                  </span>
                </span>
                {sttLive ? (
                  <Button size="sm" variant="secondary" onClick={() => runSample(s)} disabled={s.run?.state === "running"}>
                    {s.run?.state === "running" ? <Loader2 className="animate-spin" /> : <Play />}
                    {s.run?.state === "done" ? "Re-run" : "Run STT"}
                  </Button>
                ) : (
                  <span className="shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Not run</span>
                )}
              </div>
              {s.run?.state === "done" ? (
                <div className="space-y-1 rounded-md border bg-background/60 p-2.5 text-xs">
                  <p className="text-sm text-pretty">{s.run.transcript || <span className="text-muted-foreground italic">No speech detected</span>}</p>
                  <p className="font-mono text-muted-foreground tabular">
                    {s.run.wer !== null ? `WER ${formatPercent(s.run.wer, 1)} · ` : "No reference · "}
                    {formatMs(s.run.latencyMs)} round trip{s.run.model ? ` · ${s.run.model}` : ""}
                  </p>
                </div>
              ) : s.run?.state === "error" ? (
                <p className="text-xs text-destructive">{s.run.message}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-pretty text-muted-foreground">
        {sttLive
          ? "Clips are sent to Gnani Prisma only when you press Run. Results are kept in this browser tab."
          : "Clips stay in this browser. Speech-to-text is simulated, so lab runs are disabled until Gnani Prisma is configured."}
      </p>
    </div>
  );
}
