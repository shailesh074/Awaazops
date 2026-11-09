import { connection } from "next/server";
import { Info } from "lucide-react";
import { dataSource } from "@/server/data";
import { getProviderStatus } from "@/server/providers/status";
import { cn } from "@/lib/utils";

/**
 * States only what is actually true right now: whether data lives in the in-memory demo store and
 * which stages (if any) are simulated. Renders nothing when everything is live and persisted —
 * replacing a blanket "demo data / mock AI" banner that would be false with Gnani + Supabase configured.
 */
export async function DataNotice({ className }: { className?: string }) {
  await connection();
  const memory = dataSource() === "demo-memory";
  const simulated = getProviderStatus().filter((p) => p.kind === "simulated");
  if (!memory && simulated.length === 0) return null;

  const parts: string[] = [];
  if (memory) parts.push("Data is in the in-memory demo store (seeded fixtures plus anything you submit) and resets when the server restarts.");
  if (simulated.length) {
    const names = simulated.map((p) => (p.stage === "stt" ? "speech-to-text" : "voice responses"));
    parts.push(`Simulated: ${names.join(" and ")} — configure Gnani to use the real service.`);
  }
  return (
    <div role="note" className={cn("flex items-start gap-2.5 rounded-lg border border-simulated/25 bg-simulated/[0.06] px-3.5 py-2.5 text-xs text-simulated", className)}>
      <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <p className="text-pretty">{parts.join(" ")}</p>
    </div>
  );
}
