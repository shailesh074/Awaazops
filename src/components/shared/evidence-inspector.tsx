"use client";

import { useMemo, useState } from "react";
import { Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExtractionPayload } from "@/domain";
import { FIELD_LABELS, type EvidenceFieldKey } from "@/lib/labels";
import { displayValue } from "@/lib/extraction-display";

const FIELD_ORDER: EvidenceFieldKey[] = ["orderReference", "issue", "requestedAction", "timeConstraint", "notes"];

interface Segment {
  text: string;
  fields: EvidenceFieldKey[];
}

/** Split the transcript at every evidence boundary so overlapping spans render correctly. */
function segment(text: string, payload: ExtractionPayload): Segment[] {
  const spans = FIELD_ORDER.flatMap((key) => {
    const ev = payload[key].evidence;
    // Only trust spans that actually match the transcript.
    return ev && text.slice(ev.start, ev.end) === ev.quote ? [{ key, ...ev }] : [];
  });
  const cuts = new Set([0, text.length]);
  spans.forEach((s) => {
    cuts.add(s.start);
    cuts.add(s.end);
  });
  const points = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    out.push({
      text: text.slice(a, b),
      fields: spans.filter((s) => s.start <= a && s.end >= b).map((s) => s.key),
    });
  }
  return out;
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="flex items-center gap-2" title={`Model-reported confidence ${pct}%`}>
      <span className="h-1 w-12 overflow-hidden rounded-full bg-foreground/10">
        <span
          className={cn("block h-full rounded-full", value >= 0.8 ? "bg-primary" : value >= 0.6 ? "bg-warning" : "bg-destructive")}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-8 text-right font-mono text-[11px] text-muted-foreground tabular">{pct}%</span>
    </span>
  );
}

/**
 * Transcript with evidence highlights, linked to the extracted-field list: hovering or focusing a field
 * lights up the words it came from, and vice versa. This is the "evidence" half of the Reliability Engine made visible.
 */
export function EvidenceInspector({
  transcript,
  payload,
  className,
  transcriptAside,
  editedFields = [],
}: {
  transcript: string;
  payload: ExtractionPayload;
  className?: string;
  transcriptAside?: React.ReactNode;
  /** Fields the agent corrected manually; shown as edited instead of quoting evidence. */
  editedFields?: EvidenceFieldKey[];
}) {
  const [active, setActive] = useState<EvidenceFieldKey | null>(null);
  const segments = useMemo(() => segment(transcript, payload), [transcript, payload]);

  return (
    <div className={cn("grid gap-4", className)}>
      <div className="rounded-lg border bg-background/60 p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <Quote className="size-3" aria-hidden="true" /> Transcript
          </p>
          {transcriptAside}
        </div>
        <p className="text-[15px] leading-7 text-pretty">
          {segments.map((s, i) =>
            s.fields.length === 0 ? (
              <span key={i} className="text-foreground/75">
                {s.text}
              </span>
            ) : (
              <mark
                key={i}
                onMouseEnter={() => setActive(s.fields[0])}
                onMouseLeave={() => setActive(null)}
                title={s.fields.map((f) => FIELD_LABELS[f]).join(" · ")}
                className={cn(
                  "rounded-[3px] bg-transparent text-foreground underline decoration-2 underline-offset-[5px] transition-colors",
                  active && s.fields.includes(active)
                    ? "bg-primary/20 decoration-primary"
                    : "decoration-primary/45",
                )}
              >
                {s.text}
              </mark>
            ),
          )}
        </p>
      </div>

      <dl className="divide-y rounded-lg border">
        {FIELD_ORDER.map((key) => {
          const field = payload[key];
          const value = displayValue(payload, key);
          return (
            <div
              key={key}
              tabIndex={field.evidence ? 0 : -1}
              onMouseEnter={() => setActive(key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(key)}
              onBlur={() => setActive(null)}
              className={cn(
                "grid grid-cols-[7.5rem_1fr] items-start gap-x-3 gap-y-1 px-4 py-3 outline-none transition-colors sm:grid-cols-[8.5rem_1fr_auto]",
                active === key && "bg-primary/[0.06]",
              )}
            >
              <dt className="pt-px text-xs text-muted-foreground">{FIELD_LABELS[key]}</dt>
              <dd className="min-w-0 text-sm">
                {value ? (
                  <span className={cn(key === "orderReference" && "font-mono")}>{value}</span>
                ) : (
                  <span className="text-muted-foreground/70 italic">Not mentioned</span>
                )}
                {editedFields.includes(key) ? (
                  <span className="mt-0.5 block text-xs text-info">Edited by agent</span>
                ) : field.evidence ? (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    “{field.evidence.quote}”
                  </span>
                ) : null}
              </dd>
              <dd className="col-start-2 sm:col-start-3">
                {value && !editedFields.includes(key) ? (
                  field.confidence !== null ? (
                    <ConfidenceMeter value={field.confidence} />
                  ) : field.evidence ? (
                    // No genuine score exists (deterministic rule match) — say so rather than show a number.
                    <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase" title="Matched by a deterministic rule; no confidence score">
                      rule match
                    </span>
                  ) : null
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>

      {payload.ambiguities.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-warning/25 bg-warning/[0.06] px-4 py-3 text-xs text-warning">
          {payload.ambiguities.map((a) => (
            <li key={a}>⚠ {a}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
