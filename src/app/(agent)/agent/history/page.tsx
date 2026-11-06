import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ScaffoldPanel } from "@/components/shared/scaffold-panel";

export const metadata: Metadata = { title: "My reports" };

export default function AgentHistoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="My reports" description="Your previous voice reports and their outcomes." />
      <ScaffoldPanel
        step="step 3 (frontend)"
        items={["Report list with status", "Report detail: transcript, action, outcome"]}
      />
    </div>
  );
}
