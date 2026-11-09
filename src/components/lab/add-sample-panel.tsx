"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic, Square, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipPlayer } from "@/components/audio/clip-player";
import { LiveWaveform } from "@/components/audio/live-waveform";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { ACTION_TYPES, ISSUE_TYPES, LANGUAGE_CODES, type LanguageCode, type NoiseLevel } from "@/domain";
import { ACTION_LABELS, ISSUE_LABELS, LANGUAGE_LABELS_SHORT } from "@/lib/labels";
import { formatDuration } from "@/lib/format";
import { toWav16kMono } from "@/lib/audio/to-wav";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const NONE = "__none";

/**
 * Saves a labelled test clip to the server: the audio plus the ground truth it should produce (order ID,
 * issue, requested action, whether clarification is expected) and an optional reference transcript for WER.
 * Clips are converted to 16 kHz mono WAV in the browser so every sample reaches Prisma in the same format.
 */
export function AddSamplePanel() {
  const router = useRouter();
  const recorder = useAudioRecorder();
  const fileRef = useRef<HTMLInputElement>(null);
  const [clip, setClip] = useState<{ name: string; url: string; durationMs: number; blob: Blob } | null>(null);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<LanguageCode>("hi-en");
  const [noise, setNoise] = useState<NoiseLevel>("moderate");
  const [accent, setAccent] = useState("");
  const [reference, setReference] = useState("");
  const [expectedOrder, setExpectedOrder] = useState("");
  const [expectedIssue, setExpectedIssue] = useState(NONE);
  const [expectedAction, setExpectedAction] = useState(NONE);
  const [clarify, setClarify] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeClip =
    clip ??
    (recorder.audio
      ? { name: "Recording", url: recorder.audio.url, durationMs: recorder.audio.durationMs, blob: recorder.audio.blob }
      : null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) return toast.error("Choose an audio file.");
    if (file.size > MAX_UPLOAD_BYTES) return toast.error("Audio must be 10 MB or smaller.");
    const url = URL.createObjectURL(file);
    const probe = new Audio(url);
    probe.onloadedmetadata = () =>
      setClip({ name: file.name, url, blob: file, durationMs: Number.isFinite(probe.duration) ? probe.duration * 1000 : 0 });
    probe.onerror = () => toast.error("This audio format could not be read by the browser.");
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const clearClip = () => {
    setClip(null);
    recorder.reset();
    if (fileRef.current) fileRef.current.value = "";
  };

  const save = async () => {
    if (!activeClip) return;
    setSaving(true);
    try {
      const wav = await toWav16kMono(activeClip.blob);
      if (wav.durationMs > 30_500) throw new Error("Prisma accepts clips up to 30 seconds.");
      const form = new FormData();
      form.set("audio", wav.blob, "sample.wav");
      form.set("title", title.trim() || activeClip.name);
      form.set("language", language);
      form.set("accent", accent);
      form.set("noise", noise);
      form.set("durationMs", String(Math.round(wav.durationMs)));
      form.set("reference", reference);
      form.set("expectedOrder", expectedOrder);
      if (expectedIssue !== NONE) form.set("expectedIssue", expectedIssue);
      if (expectedAction !== NONE) form.set("expectedAction", expectedAction);
      form.set("expectsClarification", String(clarify));
      const res = await fetch("/api/lab/samples", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
      toast.success(`Sample ${body.sample.id} saved`);
      clearClip();
      setTitle("");
      setAccent("");
      setReference("");
      setExpectedOrder("");
      setExpectedIssue(NONE);
      setExpectedAction(NONE);
      setClarify(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the sample.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {activeClip ? (
        <div className="flex items-center gap-2 rounded-lg border bg-background/60 p-3">
          <ClipPlayer url={activeClip.url} durationMs={activeClip.durationMs} className="flex-1" />
          <Button variant="ghost" size="icon" onClick={clearClip} aria-label="Remove clip">
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

      <div className="space-y-1.5">
        <Label htmlFor="lab-title">Title</Label>
        <Input id="lab-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Customer absent, roadside" />
      </div>
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

      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-xs font-medium">Ground truth</legend>
        <div className="space-y-1.5">
          <Label htmlFor="lab-order">Order number</Label>
          <Input
            id="lab-order"
            inputMode="numeric"
            value={expectedOrder}
            onChange={(e) => setExpectedOrder(e.target.value.replace(/\D/g, ""))}
            placeholder="Digits only, e.g. 4521"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="lab-issue">Issue</Label>
            <Select value={expectedIssue} onValueChange={setExpectedIssue}>
              <SelectTrigger id="lab-issue" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {ISSUE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ISSUE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lab-action">Action</Label>
            <Select value={expectedAction} onValueChange={setExpectedAction}>
              <SelectTrigger id="lab-action" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {ACTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ACTION_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={clarify} onChange={(e) => setClarify(e.target.checked)} className="size-4 accent-primary" />
          Should ask for clarification
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="lab-ref">Reference transcript (optional)</Label>
          <Textarea
            id="lab-ref"
            rows={2}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="What was actually said — enables word error rate"
          />
        </div>
      </fieldset>

      <Button className="w-full" onClick={save} disabled={!activeClip || saving}>
        {saving ? <Loader2 className="animate-spin" /> : null} Save sample
      </Button>
      <p className="text-xs text-pretty text-muted-foreground">
        Samples are stored privately and only sent to Gnani Prisma when you run the benchmark.
      </p>
    </div>
  );
}
