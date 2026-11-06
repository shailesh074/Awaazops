import type { Metadata } from "next";
import { ReportFlow } from "@/components/agent/report-flow";

export const metadata: Metadata = { title: "Report an issue" };

export default function AgentReportPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Report an issue</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Speak naturally in Hindi, English or Hinglish. Nothing changes until you confirm.
        </p>
      </header>
      <ReportFlow />
    </div>
  );
}
