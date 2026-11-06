import { cn } from "@/lib/utils";

export interface BarDatum {
  label: string;
  value: number;
  /** Optional formatted value; defaults to the number. */
  display?: string;
}

/**
 * Single-series horizontal bars (one hue → magnitude). Labels and values are text, so the chart doubles
 * as its own table view; each row carries a native tooltip with the exact value.
 */
export function BarList({
  data,
  className,
  max,
  ariaLabel,
}: {
  data: BarDatum[];
  className?: string;
  max?: number;
  ariaLabel: string;
}) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <ul aria-label={ariaLabel} className={cn("space-y-2.5", className)}>
      {data.map((d) => (
        <li
          key={d.label}
          title={`${d.label}: ${d.display ?? d.value}`}
          className="group grid grid-cols-[minmax(0,10.5rem)_1fr_auto] items-center gap-3 text-sm"
        >
          <span className="truncate text-muted-foreground group-hover:text-foreground">{d.label}</span>
          <span className="h-2 rounded-full bg-foreground/[0.06]">
            <span
              className="block h-full rounded-full bg-primary/80 transition-colors group-hover:bg-primary"
              style={{ width: `${(d.value / top) * 100}%`, minWidth: d.value > 0 ? 4 : 0 }}
            />
          </span>
          <span className="w-14 text-right font-mono text-xs tabular">{d.display ?? d.value}</span>
        </li>
      ))}
    </ul>
  );
}
