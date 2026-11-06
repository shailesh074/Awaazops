"use client";

import { MessageCircleQuestion, Volume2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProviderBadge } from "@/components/shared/provider-badge";
import { cn } from "@/lib/utils";

/**
 * What the system says back to the agent. Audio comes from Gnani Timbre once integrated;
 * until then there is no audio and the play control is disabled, never faked with browser TTS.
 */
export function VoicePromptCard({
  text,
  tone,
}: {
  text: string;
  tone: "confirm" | "clarify" | "blocked";
}) {
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
        <ProviderBadge provenance={{ provider: "mock-tts", simulated: true }} />
      </div>
      <div className="flex items-start gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            {/* span wrapper so the tooltip works on a disabled button */}
            <span tabIndex={0} className="shrink-0 rounded-full">
              <button
                type="button"
                disabled
                aria-label="Play voice confirmation (unavailable)"
                className="grid size-9 place-items-center rounded-full border bg-background/60 text-muted-foreground disabled:cursor-not-allowed"
              >
                <Volume2 className="size-4" />
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Voice playback arrives with Gnani Timbre (step 7)</TooltipContent>
        </Tooltip>
        <p className="pt-1.5 text-[15px] leading-6 text-pretty">{text}</p>
      </div>
    </section>
  );
}
