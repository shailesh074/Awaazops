"use client";

import { useMemo, useState } from "react";
import type { Agent, AuditEvent } from "@/domain";
import { cn } from "@/lib/utils";
import { AuditTimeline, EVENT_LABELS } from "./audit-timeline";

export function AuditLog({ events, agents }: { events: AuditEvent[]; agents: Agent[] }) {
  const [type, setType] = useState<string | null>(null);
  const types = useMemo(() => [...new Set(events.map((e) => e.event))], [events]);
  const shown = type ? events.filter((e) => e.event === type) : events;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by event">
        {[null, ...types].map((t) => (
          <button
            key={t ?? "all"}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={cn(
              "h-7 rounded-full border px-3 text-xs transition-colors",
              type === t
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t ? (EVENT_LABELS[t] ?? t) : "All events"}
            <span className="ml-1.5 font-mono text-[10px] text-muted-foreground tabular">
              {t ? events.filter((e) => e.event === t).length : events.length}
            </span>
          </button>
        ))}
      </div>
      <div className="rounded-xl border bg-surface p-5">
        <AuditTimeline events={shown} agents={agents} />
      </div>
    </div>
  );
}
