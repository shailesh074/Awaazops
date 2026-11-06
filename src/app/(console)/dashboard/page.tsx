import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ScaffoldPanel } from "@/components/shared/scaffold-panel";

export const metadata: Metadata = { title: "Operations overview" };

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operations"
        title="Overview"
        description="Live view of delivery exceptions reported by voice, verified and actioned."
      />
      <ScaffoldPanel
        step="step 3 (frontend)"
        items={[
          "KPIs: total orders, pending exceptions, completed actions",
          "Failed deliveries and rescheduled deliveries",
          "Priority-based exception queue",
          "Exception volume and resolution-time trends",
          "Recent confirmed actions feed",
          "Provider status (live vs. simulated)",
        ]}
      />
    </div>
  );
}
