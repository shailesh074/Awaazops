import { FlaskConical, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PROVIDER_LABELS, type Provenance } from "@/domain";

/**
 * The single place that renders where an AI result came from.
 * Simulated output is always labelled SIMULATED — this is a product guarantee, not decoration.
 */
export function ProviderBadge({
  provenance,
  className,
}: {
  provenance: Pick<Provenance, "provider" | "simulated" | "model">;
  className?: string;
}) {
  const label = PROVIDER_LABELS[provenance.provider];
  const Icon = provenance.simulated ? FlaskConical : ShieldCheck;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded-full border px-2 font-mono text-[10px] font-medium tracking-wider uppercase",
            provenance.simulated
              ? "border-simulated/30 bg-simulated/10 text-simulated"
              : "border-success/25 bg-success/10 text-success",
            className,
          )}
        >
          <Icon className="size-3" aria-hidden="true" />
          {provenance.simulated ? "Simulated" : "Live"}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {provenance.model ? ` · ${provenance.model}` : ""}
        {provenance.simulated ? " — not a real AI result" : ""}
      </TooltipContent>
    </Tooltip>
  );
}
