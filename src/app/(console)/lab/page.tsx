import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ScaffoldPanel } from "@/components/shared/scaffold-panel";

export const metadata: Metadata = { title: "Intelligence Testing Lab" };

export default function LabPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Intelligence"
        title="Testing Lab"
        description="Measure transcription and extraction reliability on realistic Indian speech."
      />
      <ScaffoldPanel
        step="step 3 (frontend)"
        items={[
          "Upload or record audio samples",
          "Tag samples: accent, Hindi / Hinglish / English, noise level",
          "Original transcript vs. reference transcript",
          "Extracted JSON inspector",
          "Field-level extraction accuracy",
          "Per-stage latency (STT, reasoning, validation, TTS)",
          "Failed and ambiguous case explorer",
          "Live vs. simulated provider labelling on every run",
        ]}
      />
    </div>
  );
}
