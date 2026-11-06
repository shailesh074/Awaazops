import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shown on every screen that renders demo fixtures instead of database records. */
export function DemoDataBanner({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-simulated/25 bg-simulated/[0.06] px-3.5 py-2.5 text-xs text-simulated",
        className,
      )}
    >
      <FlaskConical className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <p className="text-pretty">
        <span className="font-semibold">Demo data.</span>{" "}
        {children ??
          "Seeded orders and reports, plus any you submit, live in an in-memory store that resets when the server restarts. AI results come from mock providers, not Gnani or an LLM."}
      </p>
    </div>
  );
}
