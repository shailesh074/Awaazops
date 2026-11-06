/**
 * SIMULATED pipeline for the Agent Portal UI (step 3).
 * Steps through the stages with short fixed pauses and returns a scripted scenario.
 * It neither transcribes the recording nor calls any AI. Step 4 replaces this with POST /api/reports.
 */
import type { ReportDetail } from "@/domain";
import { AGENT_SCENARIOS } from "@/mocks/agent-scenarios";

export const DEMO_STAGES = [
  { id: "stt", label: "Transcribing speech" },
  { id: "reasoning", label: "Understanding the report" },
  { id: "validation", label: "Verifying against orders" },
  { id: "tts", label: "Preparing confirmation" },
] as const;
export type DemoStageId = (typeof DEMO_STAGES)[number]["id"];

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runDemoPipeline(
  scenarioId: string,
  onStage: (stage: DemoStageId) => void,
): Promise<ReportDetail> {
  const scenario = AGENT_SCENARIOS.find((s) => s.id === scenarioId) ?? AGENT_SCENARIOS[0];
  for (const stage of DEMO_STAGES) {
    onStage(stage.id);
    await pause(stage.id === "validation" ? 350 : 550);
  }
  return scenario.build();
}
