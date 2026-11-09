import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { DataNotice } from "@/components/shared/data-notice";
import { OrdersTable } from "@/components/dashboard/orders-table";
import { listAgents, listOrders, listReports } from "@/server/data";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage() {
  const [orders, agents, reports] = await Promise.all([listOrders(), listAgents(), listReports()]);
  const reportsByOrder: Record<string, string[]> = {};
  for (const r of reports) {
    if (r.order) (reportsByOrder[r.order.id] ??= []).push(r.report.id);
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Orders"
        description="Today's delivery manifest and the voice reports linked to each order."
      />
      <DataNotice />
      <OrdersTable orders={orders} agents={agents} reportsByOrder={reportsByOrder} />
    </div>
  );
}
