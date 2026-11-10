import { cn } from "@/lib/utils";
import type { OrderStatus, Priority, ReportStatus, ValidationOutcome } from "@/domain";
import {
  ORDER_STATUS_LABELS,
  OUTCOME_LABELS,
  PRIORITY_LABELS,
  REPORT_STATUS_LABELS,
} from "@/lib/labels";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONE: Record<Tone, string> = {
  neutral: "text-muted-foreground bg-muted border-border",
  accent: "text-primary bg-primary/10 border-primary/25",
  success: "text-success bg-success/10 border-success/25",
  warning: "text-warning bg-warning/10 border-warning/25",
  danger: "text-destructive bg-destructive/10 border-destructive/25",
  info: "text-info bg-info/10 border-info/25",
};

export function Pill({
  tone,
  children,
  dot = true,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const REPORT_TONE: Record<ReportStatus, Tone> = {
  RECORDED: "neutral",
  TRANSCRIBED: "neutral",
  EXTRACTED: "neutral",
  VALIDATED: "info",
  NEEDS_CLARIFICATION: "warning",
  AWAITING_CONFIRMATION: "accent",
  ESCALATED: "danger",
  EDITED: "info",
  CONFIRMED: "info",
  EXECUTED: "success",
  REJECTED: "neutral",
  FAILED: "danger",
};

export function ReportStatusPill({ status }: { status: ReportStatus }) {
  return <Pill tone={REPORT_TONE[status]}>{REPORT_STATUS_LABELS[status]}</Pill>;
}

const ORDER_TONE: Record<OrderStatus, Tone> = {
  OUT_FOR_DELIVERY: "info",
  ATTEMPTED: "warning",
  RESCHEDULED: "accent",
  DELIVERED: "success",
  FAILED: "danger",
  ON_HOLD: "warning",
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return <Pill tone={ORDER_TONE[status]}>{ORDER_STATUS_LABELS[status]}</Pill>;
}

const OUTCOME_TONE: Record<ValidationOutcome, Tone> = {
  VERIFIED: "success",
  NEEDS_CLARIFICATION: "warning",
  REJECTED: "danger",
};

export function OutcomePill({ outcome }: { outcome: ValidationOutcome }) {
  return <Pill tone={OUTCOME_TONE[outcome]}>{OUTCOME_LABELS[outcome]}</Pill>;
}

/** Priority uses a bar glyph plus label, so it never relies on colour alone. */
export function PriorityPill({ priority }: { priority: Priority }) {
  const level = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[priority];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span className="flex items-end gap-px" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-[1px]",
              i <= level
                ? priority === "CRITICAL"
                  ? "bg-destructive"
                  : priority === "HIGH"
                    ? "bg-warning"
                    : "bg-foreground/70"
                : "bg-foreground/15",
            )}
            style={{ height: 4 + i * 2 }}
          />
        ))}
      </span>
      <span className={cn(priority === "CRITICAL" ? "text-destructive" : "text-foreground/90")}>
        {PRIORITY_LABELS[priority]}
      </span>
    </span>
  );
}
