import { CircleCheck, CircleDashed, CircleX, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ValidationCheck, ValidationResult } from "@/domain";
import { CHECK_LABELS } from "@/lib/labels";
import { OutcomePill } from "./status-pill";

const ICON = {
  PASS: { Icon: CircleCheck, className: "text-success", label: "Passed" },
  WARN: { Icon: TriangleAlert, className: "text-warning", label: "Warning" },
  FAIL: { Icon: CircleX, className: "text-destructive", label: "Failed" },
  SKIPPED: { Icon: CircleDashed, className: "text-muted-foreground/70", label: "Skipped" },
} satisfies Record<ValidationCheck["status"], unknown>;

export function ValidationChecklist({
  validation,
  compact = false,
}: {
  validation: ValidationResult;
  compact?: boolean;
}) {
  const counts = validation.checks.reduce(
    (acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }),
    {} as Partial<Record<ValidationCheck["status"], number>>,
  );

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <OutcomePill outcome={validation.outcome} />
        <p className="font-mono text-[11px] text-muted-foreground tabular">
          {counts.PASS ?? 0} pass · {counts.WARN ?? 0} warn · {counts.FAIL ?? 0} fail
        </p>
      </div>
      <ul className="divide-y">
        {validation.checks
          .filter((c) => !compact || c.status !== "PASS")
          .map((c) => {
            const { Icon, className, label } = ICON[c.status];
            return (
              <li key={c.id} className="flex items-start gap-3 px-4 py-2.5">
                <Icon className={cn("mt-0.5 size-4 shrink-0", className)} aria-label={label} />
                <div className="min-w-0">
                  <p className="text-sm">{CHECK_LABELS[c.id]}</p>
                  <p className="text-xs text-pretty text-muted-foreground">{c.detail}</p>
                </div>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
