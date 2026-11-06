"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, Pause, Volume2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProviderBadge } from "@/components/shared/provider-badge";
import { cn } from "@/lib/utils";
import type { Provenance } from "@/domain";

/**
 * What the system says back to the agent. With Gnani Timbre configured, the prompt is real synthesized
 * speech and plays automatically; without it, the play control is disabled — never faked with browser TTS.
 */
export function VoicePromptCard({
  text,
  tone,
  audio,
  simulated,
}: {
  text: string;
  tone: "confirm" | "clarify" | "blocked";
  /** Synthesized audio for exactly this prompt, if any. */
  audio: { url: string; provenance: Provenance } | null;
  /** Whether text-to-speech is the mock provider (used for the badge when there is no audio). */
  simulated: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);

  // Speak as soon as a new prompt arrives (keyed on the URL, which changes with each new prompt).
  // Browsers may block autoplay; then the agent taps play.
  const url = audio?.url;
  useEffect(() => {
    const el = ref.current;
    if (!el || !url) return;
    el.currentTime = 0;
    el.play().then(
      () => setBlocked(false),
      () => setBlocked(true),
    );
  }, [url]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setBlocked(true));
    else el.pause();
  };

  const provenance: Pick<Provenance, "provider" | "simulated" | "model"> =
    audio?.provenance ?? { provider: simulated ? "mock-tts" : "gnani-timbre", simulated };

  return (
    <section
      className={cn(
        "rounded-2xl border p-4",
        tone === "confirm" && "border-primary/30 bg-primary/[0.07]",
        tone === "clarify" && "border-warning/30 bg-warning/[0.06]",
        tone === "blocked" && "border-destructive/30 bg-destructive/[0.06]",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageCircleQuestion className="size-3.5" aria-hidden="true" />
          {tone === "confirm" ? "Confirmation" : tone === "clarify" ? "Clarification needed" : "Not updated"}
        </p>
        <ProviderBadge provenance={provenance} />
      </div>
      <div className="flex items-start gap-3">
        {audio ? (
          <>
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause voice prompt" : "Play voice prompt"}
              className={cn(
                "relative grid size-9 shrink-0 place-items-center rounded-full border transition-colors",
                playing ? "border-primary/50 bg-primary text-primary-foreground" : "bg-background/60 hover:bg-background",
                blocked && !playing && "animate-pulse border-primary/50",
              )}
            >
              {playing ? <Pause className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <audio
              ref={ref}
              src={audio.url}
              preload="auto"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          </>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* span wrapper so the tooltip works on a disabled button */}
              <span tabIndex={0} className="shrink-0 rounded-full">
                <button
                  type="button"
                  disabled
                  aria-label="Play voice prompt (unavailable)"
                  className="grid size-9 place-items-center rounded-full border bg-background/60 text-muted-foreground disabled:cursor-not-allowed"
                >
                  <Volume2 className="size-4" />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{simulated ? "Voice playback needs Gnani Timbre" : "Voice prompt unavailable — showing text"}</TooltipContent>
          </Tooltip>
        )}
        <div className="min-w-0 pt-1.5">
          <p className="text-[15px] leading-6 text-pretty">{text}</p>
          {blocked && audio && !playing ? <p className="mt-1 text-xs text-muted-foreground">Tap the speaker to listen.</p> : null}
        </div>
      </div>
    </section>
  );
}
