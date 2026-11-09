import { Cog, FlaskConical, ShieldCheck, Undo2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DETERMINISTIC_PROVIDERS, PROVIDER_LABELS, type Provenance } from "@/domain";

/**
 * The single place that renders where a result came from. Three honest states:
 *  - LIVE       real AI service (Gnani Prisma / Timbre, Claude)
 *  - RULES      deterministic engine — not AI, not simulated (marked when it ran as a fallback)
 *  - SIMULATED  mock / scripted output — never presented as a real result
 */
export function ProviderBadge({
  provenance,
  className,
}: {
  provenance: Pick<Provenance, "provider" | "simulated" | "model" | "fallbackFrom" | "fallbackReason">;
  className?: string;
}) {
  const label = PROVIDER_LABELS[provenance.provider];
  const rules = DETERMINISTIC_PROVIDERS.includes(provenance.provider);
  const fallback = Boolean(provenance.fallbackFrom);
  const state = provenance.simulated ? "simulated" : rules ? "rules" : "live";
  const Icon = fallback ? Undo2 : state === "simulated" ? FlaskConical : state === "rules" ? Cog : ShieldCheck;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded-full border px-2 font-mono text-[10px] font-medium tracking-wider uppercase",
            state === "simulated" && "border-simulated/30 bg-simulated/10 text-simulated",
            state === "rules" && "border-info/25 bg-info/10 text-info",
            state === "live" && "border-success/25 bg-success/10 text-success",
            className,
          )}
        >
          <Icon className="size-3" aria-hidden="true" />
          {state === "simulated" ? "Simulated" : state === "rules" ? (fallback ? "Rules · fallback" : "Rules") : "Live"}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        {label}
        {provenance.model ? ` · ${provenance.model}` : ""}
        {state === "simulated" ? " — not a real AI result" : ""}
        {state === "rules" && !fallback ? " — deterministic, not AI" : ""}
        {fallback && provenance.fallbackFrom
          ? ` — used because ${PROVIDER_LABELS[provenance.fallbackFrom]} was unavailable (${provenance.fallbackReason ?? "unknown reason"})`
          : ""}
      </TooltipContent>
    </Tooltip>
  );
}
