import type { ReportDetail } from "@/domain";
import { ISSUE_LABELS } from "@/lib/labels";

/** Short issue description for table rows. */
export function issueSummary(r: ReportDetail): string {
  const issue = r.extraction?.payload.issue.value;
  if (issue) return ISSUE_LABELS[issue];
  return r.report.status === "FAILED" ? "Transcription failed" : "Unclassified";
}

/** Order ID or the spoken reference that failed to resolve. */
export function orderLabel(r: ReportDetail): { text: string; unresolved: boolean } {
  if (r.order && r.validation?.outcome !== "NEEDS_CLARIFICATION") return { text: r.order.id, unresolved: false };
  const spoken = r.extraction?.payload.orderReference.value;
  return { text: spoken ? `“${spoken}”` : "—", unresolved: true };
}
