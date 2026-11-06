import { cn } from "@/lib/utils";

/** AwaazOps mark: five waveform bars resolving into a steady line — voice becoming structure. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-6 text-primary", className)}
      fill="currentColor"
    >
      <rect x="2" y="9" width="2.4" height="6" rx="1.2" opacity="0.55" />
      <rect x="6.4" y="5" width="2.4" height="14" rx="1.2" opacity="0.75" />
      <rect x="10.8" y="2" width="2.4" height="20" rx="1.2" />
      <rect x="15.2" y="8" width="2.4" height="8" rx="1.2" opacity="0.75" />
      <rect x="19.6" y="11" width="2.4" height="2" rx="1" opacity="0.55" />
    </svg>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <BrandMark className="size-5" />
      <span className="text-[15px] font-semibold tracking-tight">
        Awaaz<span className="text-muted-foreground">Ops</span>
      </span>
    </span>
  );
}
