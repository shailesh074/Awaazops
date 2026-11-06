import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ScaffoldPanel } from "@/components/shared/scaffold-panel";

export const metadata: Metadata = { title: "Exceptions" };

export default function ExceptionsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operations"
        title="Exceptions"
        description="Voice-reported issues awaiting review, clarification or confirmation."
      />
      <ScaffoldPanel
        step="step 3 (frontend)"
        items={[
          "Filterable exception table (status, priority, issue, agent)",
          "Exception inspector: audio, transcript, evidence highlights",
          "Extracted fields with per-field confidence",
          "Validation checks and outcome",
          "Clarification history",
          "Linked order and audit events",
        ]}
      />
    </div>
  );
}
