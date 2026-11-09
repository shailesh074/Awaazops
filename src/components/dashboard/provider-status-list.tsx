import { Cog, FlaskConical, ShieldCheck, TriangleAlert } from "lucide-react";
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
      {providers.map((p) => {
        const name = PROVIDER_LABELS[p.provider as ProviderId] ?? p.provider;
        const notConfigured = p.kind === "ai" && !p.configured;
        return (
          <li key={p.stage} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm">{STAGE_LABELS[p.stage]}</p>
              <p className="text-xs text-muted-foreground">
                {name}
                {p.fallback ? ` · falls back to ${PROVIDER_LABELS[p.fallback as ProviderId] ?? p.fallback}` : ""}
              </p>
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 font-mono text-[10px] tracking-wider uppercase",
                p.kind === "simulated" && "text-simulated",
                p.kind === "rules" && "text-info",
                p.kind === "ai" && (notConfigured ? (p.fallback ? "text-warning" : "text-destructive") : "text-success"),
              )}
            >
              {p.kind === "simulated" ? <FlaskConical className="size-3" /> : p.kind === "rules" ? <Cog className="size-3" /> : notConfigured ? <TriangleAlert className="size-3" /> : <ShieldCheck className="size-3" />}
              {p.kind === "simulated"
                ? "Simulated"
                : p.kind === "rules"
                  ? "Rules"
                  : notConfigured
                    ? p.fallback ? "Using fallback" : "Not configured"
                    : "Live"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
