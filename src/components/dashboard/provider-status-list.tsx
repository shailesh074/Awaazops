import { FlaskConical, ShieldCheck } from "lucide-react";
import { PROVIDER_LABELS, type ProviderId } from "@/domain";
import type { ProviderStatus } from "@/server/providers/status";
import { cn } from "@/lib/utils";

const STAGE_LABELS: Record<ProviderStatus["stage"], string> = {
  stt: "Speech-to-text",
  reasoning: "Reasoning",
  tts: "Text-to-speech",
};

/** Live provider configuration, read from the server environment (not demo data). */
export function ProviderStatusList({ providers }: { providers: ProviderStatus[] }) {
  return (
    <ul className="divide-y rounded-lg border">
      {providers.map((p) => (
        <li key={p.stage} className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm">{STAGE_LABELS[p.stage]}</p>
            <p className="text-xs text-muted-foreground">{PROVIDER_LABELS[p.provider as ProviderId] ?? p.provider}</p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 font-mono text-[10px] tracking-wider uppercase",
              p.simulated ? "text-simulated" : p.configured ? "text-success" : "text-destructive",
            )}
          >
            {p.simulated ? <FlaskConical className="size-3" /> : <ShieldCheck className="size-3" />}
            {p.simulated ? "Simulated" : p.configured ? "Live" : "Not configured"}
          </span>
        </li>
      ))}
    </ul>
  );
}
