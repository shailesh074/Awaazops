import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ScaffoldPanel } from "@/components/shared/scaffold-panel";

export const metadata: Metadata = { title: "Report an issue" };

export default function AgentReportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Report an issue"
        description="Speak naturally — Hindi, English or Hinglish. Nothing is updated until you confirm."
      />
      <ScaffoldPanel
        step="step 3 (frontend)"
        items={[
          "Language selection",
          "Record button with live waveform",
          "Transcript display",
          "Extracted details preview",
          "Validation results and clarification prompts",
          "Voice confirmation playback",
          "Confirm, edit or reject",
        ]}
      />
    </div>
  );
}
