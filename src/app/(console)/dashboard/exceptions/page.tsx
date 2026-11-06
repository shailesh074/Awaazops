import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { DemoDataBanner } from "@/components/shared/demo-data-banner";
import { ExceptionsTable } from "@/components/dashboard/exceptions-table";
import { listReports } from "@/server/data";

export const metadata: Metadata = { title: "Exceptions" };

export default async function ExceptionsPage() {
  const reports = await listReports();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Exceptions"
        description="Every voice report, with what was extracted, how it was verified and what happened next."
      />
      <DemoDataBanner />
      <ExceptionsTable reports={reports} />
    </div>
  );
}
