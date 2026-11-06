"use client";

import { useRef, useState } from "react";
import { Mic, Square, Upload, X } from "lucide-react";
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
import { formatDuration } from "@/lib/format";

interface QueuedSample {
  id: string;
  name: string;
  url: string;
  durationMs: number;
  language: LanguageCode;
  accent: string;
  noise: NoiseLevel;
  reference: string;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Collects new test clips locally. Nothing is uploaded or processed yet: samples are queued until the
 * Prisma integration (step 5) and lab persistence (step 8) exist.
 */
export function AddSamplePanel() {
  const recorder = useAudioRecorder();
  const fileRef = useRef<HTMLInputElement>(null);
  const [clip, setClip] = useState<{ name: string; url: string; durationMs: number } | null>(null);
  const [language, setLanguage] = useState<LanguageCode>("hi-en");
  const [noise, setNoise] = useState<NoiseLevel>("moderate");
  const [accent, setAccent] = useState("");
  const [reference, setReference] = useState("");
  const [queue, setQueue] = useState<QueuedSample[]>([]);

  const activeClip =
    clip ??
    (recorder.audio
      ? { name: "Recording", url: recorder.audio.url, durationMs: recorder.audio.durationMs }
      : null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) return toast.error("Choose an audio file.");
    if (file.size > MAX_UPLOAD_BYTES) return toast.error("Audio must be 10 MB or smaller.");
    const url = URL.createObjectURL(file);
    const probe = new Audio(url);
    probe.onloadedmetadata = () =>
      setClip({ name: file.name, url, durationMs: Number.isFinite(probe.duration) ? probe.duration * 1000 : 0 });
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
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{s.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {LANGUAGE_LABELS_SHORT[s.language]} · {s.accent} · {s.noise} · {formatDuration(s.durationMs)}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                Not run
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-pretty text-muted-foreground">
        Clips stay in this browser. They run once Gnani Prisma is connected; nothing here is uploaded yet.
      </p>
    </div>
  );
}
