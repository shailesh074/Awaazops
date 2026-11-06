import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportFlow } from "@/components/agent/report-flow";
import { getProviderStatus } from "@/server/providers/status";

export const metadata: Metadata = { title: "Report an issue" };

/** Provider config is runtime env, so the flow streams in at request time. */
async function Flow() {
  await connection();
  const providers = getProviderStatus();
  const simulated = (stage: string) => providers.find((p) => p.stage === stage)?.simulated ?? true;
  return <ReportFlow sttSimulated={simulated("stt")} ttsSimulated={simulated("tts")} />;
}

export default function AgentReportPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Report an issue</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Speak naturally in Hindi, English or Hinglish. Nothing changes until you confirm.
        </p>
      </header>
      <Suspense
        fallback={
          <div className="space-y-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        }
      >
        <Flow />
      </Suspense>
    </div>
  );
}
