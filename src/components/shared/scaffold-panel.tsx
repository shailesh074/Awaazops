import { Construction } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Temporary placeholder for screens not built yet. Lists what the screen will contain so the
 * scaffold doubles as a checklist. Removed as each module is implemented.
 */
export function ScaffoldPanel({
  step,
  items,
  className,
}: {
  step: string;
  items: string[];
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-dashed bg-surface/60 p-6",
        className,
      )}
    >
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Construction className="size-4" aria-hidden="true" />
        <span>Not built yet — planned for {step}</span>
      </div>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
