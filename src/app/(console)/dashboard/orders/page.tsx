import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ScaffoldPanel } from "@/components/shared/scaffold-panel";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operations"
        title="Orders"
        description="Search and filter delivery orders and see every voice report linked to them."
      />
      <ScaffoldPanel
        step="step 3 (frontend)"
        items={[
          "Order search by ID, customer, locality",
          "Filters: status, priority, agent, slot",
          "Order detail with slot and instructions",
          "Linked voice reports and actions",
        ]}
      />
    </div>
  );
}
