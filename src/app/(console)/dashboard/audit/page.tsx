import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ScaffoldPanel } from "@/components/shared/scaffold-panel";

export const metadata: Metadata = { title: "Audit trail" };

export default function AuditPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operations"
        title="Audit trail"
        description="Append-only record of every confirmation, edit, rejection and executed action."
      />
      <ScaffoldPanel
        step="step 3 (frontend)"
        items={[
          "Chronological event timeline",
          "Actor, entity and before/after diff",
          "Filter by order, agent or event type",
          "Link from each event back to its source transcript",
        ]}
      />
    </div>
  );
}
