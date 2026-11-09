"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LiveWaveform } from "@/components/audio/live-waveform";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { replyByVoice } from "@/lib/api/reports-client";
import type { LanguageCode, ReportDetail } from "@/domain";

const MAX_REPLY_MS = 6000;

const HINT: Record<LanguageCode, string> = {
  "hi-en": "Say “haan” to confirm or “nahi” to cancel.",
  hi: "पुष्टि के लिए “हाँ”, रद्द करने के लिए “नहीं” कहें।",
  en: "Say “yes” to confirm or “no” to cancel.",
};

/**
 * Hands-free answer to the confirmation prompt. The reply is transcribed by Gnani Prisma and classified
 * by a strict yes/no lexicon on the server; anything unclear changes nothing. Buttons remain the primary path.
 */
export function SpokenReply({
  reportId,
  language,
  disabled,
  onDecided,
}: {
  reportId: string;
  language: LanguageCode;
  disabled: boolean;
  onDecided: (detail: ReportDetail, decision: "yes" | "no") => void;
}) {
  const recorder = useAudioRecorder();
  const [sending, setSending] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const sent = useRef<Blob | null>(null);

  // Stop automatically: a yes/no needs only a few seconds.
  useEffect(() => {
    if (recorder.status === "recording" && recorder.elapsedMs >= MAX_REPLY_MS) recorder.stop();
  }, [recorder, recorder.status, recorder.elapsedMs]);

  // Send as soon as a recording is available.
  useEffect(() => {
    const audio = recorder.audio;
    if (!audio || sent.current === audio.blob) return;
    sent.current = audio.blob;
    setSending(true);
    replyByVoice(reportId, audio.blob, language)
      .then((r) => {
        setHeard(r.heard);
        if (r.decision === "unclear") toast("No clear yes or no — nothing was changed. Use the buttons or try again.");
        else onDecided(r.report, r.decision);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not process the reply."))
      .finally(() => {
        setSending(false);
        recorder.reset();
      });
  }, [recorder, recorder.audio, reportId, language, onDecided]);

  const recording = recorder.status === "recording";

  return (
    <div className="space-y-2 rounded-xl border bg-surface p-3">
      <div className="flex items-center gap-2">
        {recording ? (
          <>
            <LiveWaveform analyser={recorder.analyser} className="h-8 flex-1" />
            <Button size="sm" variant="destructive" onClick={recorder.stop}>
              <Square className="fill-current" /> Done
            </Button>
          </>
        ) : (
          <>
            <p className="flex-1 text-xs text-muted-foreground">{HINT[language]}</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setHeard(null);
                recorder.start();
              }}
              disabled={disabled || sending || recorder.status === "requesting"}
            >
              {sending ? <Loader2 className="animate-spin" /> : <Mic />} {sending ? "Listening…" : "Reply by voice"}
            </Button>
          </>
        )}
      </div>
      {heard !== null ? (
        <p className="text-xs text-muted-foreground">
          Heard: <span className="text-foreground">“{heard || "…"}”</span>
        </p>
      ) : null}
      {recorder.error ? <p className="text-xs text-warning">{recorder.error}</p> : null}
    </div>
  );
}
