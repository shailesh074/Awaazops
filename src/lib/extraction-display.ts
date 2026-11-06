import type { ExtractionPayload } from "@/domain";
import { ACTION_LABELS, ISSUE_LABELS, type EvidenceFieldKey } from "./labels";
import { formatDateTime } from "./format";

/** Human-readable value for one extracted field. Isomorphic: used by server and client components. */
export function displayValue(payload: ExtractionPayload, key: EvidenceFieldKey): string | null {
  switch (key) {
    case "orderReference":
      return payload.orderReference.value;
    case "issue":
      return payload.issue.value ? ISSUE_LABELS[payload.issue.value] : null;
    case "requestedAction":
      return payload.requestedAction.value ? ACTION_LABELS[payload.requestedAction.value] : null;
    case "timeConstraint": {
      const t = payload.timeConstraint.value;
      if (!t) return null;
      const s = t.start ? formatDateTime(t.start) : null;
      const e = t.end ? formatDateTime(t.end) : null;
      if (t.kind === "AFTER" && s) return `After ${s}`;
      if (t.kind === "BEFORE" && e) return `Before ${e}`;
      if (t.kind === "AT" && s) return `At ${s}`;
      if (t.kind === "BETWEEN" && s && e) return `${s} – ${e.split(", ").at(-1)}`;
      if (t.kind === "DATE_ONLY" && s) return s.split(",")[0];
      return t.spoken;
    }
    case "notes":
      return payload.notes.value;
  }
}
