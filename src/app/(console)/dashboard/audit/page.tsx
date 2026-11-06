import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBanner } from "@/components/shared/demo-data-banner";
import { AuditLog } from "@/components/dashboard/audit-log";
import { listAgents, listAuditEvents } from "@/server/data";

export const metadata: Metadata = { title: "Audit trail" };

export default async function AuditPage() {
  const [events, agents] = await Promise.all([listAuditEvents(), listAgents()]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Audit trail"
        description="Append-only record of submissions, verification outcomes, confirmations and executed changes."
      />
      <DemoDataBanner />
      <AuditLog events={events} agents={agents} />
    </div>
  );
}
