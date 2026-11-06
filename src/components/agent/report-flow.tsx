"use client";

import { useState } from "react";
import { CheckCircle2, CircleSlash, Info, Loader2, MapPin, OctagonX, Package, Pencil, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EvidenceInspector } from "@/components/shared/evidence-inspector";
import { ValidationChecklist } from "@/components/shared/validation-checklist";
import { ProviderBadge } from "@/components/shared/provider-badge";
import { OrderStatusPill, ReportStatusPill } from "@/components/shared/status-pill";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { confirmReport, editReport, rejectReport, submitReport } from "@/lib/api/reports-client";
import { ACTION_LABELS, type EvidenceFieldKey } from "@/lib/labels";
import { formatSlot } from "@/lib/format";
import type { LanguageCode, ReportDetail } from "@/domain";
import { DEMO_SCRIPTS } from "@/mocks/agent-scenarios";
import { ComposeStep } from "./compose-step";
import { ProcessingStep, type StageProgress } from "./processing-step";
import { VoicePromptCard } from "./voice-prompt-card";
import { EditActionForm, type ActionEdit } from "./edit-action-form";

type Phase = "compose" | "processing" | "review" | "done";
type Busy = null | "confirm" | "reject" | "edit";

/** Fields whose value carries no transcript evidence but is set — i.e. typed by the agent in an edit. */
function agentEdited(detail: ReportDetail): EvidenceFieldKey[] {
  const p = detail.extraction?.payload;
  if (!p) return [];
  return (["orderReference", "requestedAction", "notes"] as const).filter((k) => p[k].value !== null && p[k].evidence === null);
}

export function ReportFlow({ sttSimulated, ttsSimulated }: { sttSimulated: boolean; ttsSimulated: boolean }) {
  const recorder = useAudioRecorder();
  const [phase, setPhase] = useState<Phase>("compose");
  const [language, setLanguage] = useState<LanguageCode>("hi-en");
  const [scriptId, setScriptId] = useState(DEMO_SCRIPTS[0].id);
  const [progress, setProgress] = useState<StageProgress>({});
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [usedRecording, setUsedRecording] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);

  const submit = async () => {
    setProgress({});
    setPhase("processing");
    setUsedRecording(recorder.audio !== null);
    try {
      const result = await submitReport(
        {
          language,
          audio: recorder.audio?.blob ?? null,
          durationMs: recorder.audio?.durationMs,
          mockTranscript: sttSimulated ? DEMO_SCRIPTS.find((s) => s.id === scriptId)?.transcript : undefined,
        },
        (u) => setProgress((p) => ({ ...p, [u.stage]: { done: u.state === "done", latencyMs: u.state === "done" ? u.latencyMs : undefined } })),
      );
      setDetail(result);
      setPhase("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not process the report.");
      setPhase("compose");
    }
  };

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<ReportDetail>, after: (d: ReportDetail) => void) => {
    setBusy(kind);
    try {
      const d = await fn();
      setDetail(d);
      after(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  };

  const startOver = () => {
    recorder.reset();
    setDetail(null);
    setEditing(false);
    setPhase("compose");
  };

  if (phase === "compose") {
    return (
      <ComposeStep
        language={language}
        onLanguage={setLanguage}
        recorder={recorder}
        scenarioId={scriptId}
        onScenario={setScriptId}
        onSubmit={submit}
        sttSimulated={sttSimulated}
      />
    );
  }

  if (phase === "processing" || !detail) return <ProcessingStep progress={progress} />;

  const { report, validation, extraction, transcript, order, action } = detail;

  if (phase === "done") {
    const executed = report.status === "EXECUTED";
    return (
      <section className="space-y-5 rounded-2xl border bg-surface p-6 text-center">
        <span
          className={`mx-auto grid size-14 place-items-center rounded-full ${executed ? "bg-success/15 text-success" : report.status === "FAILED" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}
        >
          {executed ? <CheckCircle2 className="size-7" /> : report.status === "FAILED" ? <OctagonX className="size-7" /> : <CircleSlash className="size-7" />}
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {executed ? "Order updated" : report.status === "FAILED" ? "Not updated" : "Report discarded"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {executed && action
              ? `${ACTION_LABELS[action.type]} · ${action.orderId}`
              : (report.failureReason ?? "No changes were made to the order.")}
          </p>
        </div>
        {executed && order ? (
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <span className="font-mono">{order.id}</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground tabular">{formatSlot(order.slotStart, order.slotEnd)}</span>
              <OrderStatusPill status={order.status} />
            </span>
          </div>
        ) : null}
        {executed ? (
          <p className="text-xs text-muted-foreground">
            Recorded in the audit trail as {report.id}. Demo store: resets when the server restarts.
          </p>
        ) : null}
        <Button className="w-full" onClick={startOver}>
          Report another issue
        </Button>
      </section>
    );
  }

  // Review
  if (report.status === "FAILED" || !validation || !transcript) {
    return (
      <section className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/[0.06] p-5">
        <p className="flex items-start gap-2 text-sm text-destructive">
          <OctagonX className="mt-0.5 size-4 shrink-0" />
          {report.failureReason ?? "The report could not be processed."}
        </p>
        <p className="text-xs text-muted-foreground">Nothing was changed. Please record the report again.</p>
        <Button className="w-full" onClick={startOver}>
          <RotateCcw /> Record again
        </Button>
      </section>
    );
  }

  const awaiting = report.status === "AWAITING_CONFIRMATION";
  const clarify = report.status === "NEEDS_CLARIFICATION";
  const editable = awaiting || clarify;
  const prompt = awaiting ? (detail.confirmationPrompt ?? "") : (validation.clarificationQuestion ?? "");

  const saveEdit = (edit: ActionEdit) =>
    run("edit", () => editReport(report.id, edit), (d) => {
      setEditing(false);
      toast(d.report.status === "AWAITING_CONFIRMATION" ? "Verified — ready to confirm" : "Still needs attention");
    });

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{report.id}</span>
          <ReportStatusPill status={report.status} />
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy !== null}
          onClick={() =>
            editable
              ? run("reject", () => rejectReport(report.id), () => setPhase("done"))
              : startOver()
          }
        >
          <X /> Discard
        </Button>
      </div>

      {usedRecording && sttSimulated ? (
        <p className="flex items-start gap-2 rounded-lg border border-simulated/25 bg-simulated/[0.06] px-3 py-2 text-xs text-simulated">
          <Info className="mt-px size-3.5 shrink-0" />
          Your recording was not transcribed: speech-to-text is mocked, so the demo script was used as the transcript.
        </p>
      ) : null}

      <VoicePromptCard
        text={prompt}
        tone={awaiting ? "confirm" : report.status === "REJECTED" ? "blocked" : "clarify"}
        simulated={ttsSimulated}
        audio={
          detail.promptAudio
            ? {
                // The version param changes whenever a new prompt is synthesized (e.g. after an edit).
                url: `/api/reports/${encodeURIComponent(report.id)}/prompt-audio?v=${encodeURIComponent(detail.promptAudio.provenance.createdAt)}`,
                provenance: detail.promptAudio.provenance,
              }
            : null
        }
      />

      {editing ? (
        <EditActionForm
          initial={{
            orderReference: extraction?.payload.orderReference.value ?? "",
            requestedAction: extraction?.payload.requestedAction.value ?? null,
            notes: extraction?.payload.notes.value ?? "",
          }}
          onSave={saveEdit}
          onCancel={() => setEditing(false)}
          busy={busy === "edit"}
        />
      ) : null}

      {order ? (
        <section className="rounded-2xl border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 font-mono text-sm">
              <Package className="size-3.5 text-muted-foreground" /> {order.id}
            </p>
            <OrderStatusPill status={order.status} />
          </div>
          <p className="text-sm">{order.customerName}</p>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 size-3 shrink-0" />
            {order.addressLine}, {order.locality} · slot {formatSlot(order.slotStart, order.slotEnd)}
          </p>
        </section>
      ) : null}

      {extraction ? (
        <EvidenceInspector
          transcript={transcript.text}
          payload={extraction.payload}
          editedFields={agentEdited(detail)}
          transcriptAside={<ProviderBadge provenance={transcript.provenance} />}
        />
      ) : null}

      <ValidationChecklist validation={validation} compact />

      {awaiting ? (
        <div className="sticky bottom-16 z-10 -mx-4 grid grid-cols-[1fr_auto_auto] gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur">
          <Button
            size="lg"
            className="h-11"
            disabled={busy !== null}
            onClick={() =>
              run("confirm", () => confirmReport(report.id), (d) => {
                setPhase("done");
                if (d.report.status === "EXECUTED") toast.success("Order updated");
              })
            }
          >
            {busy === "confirm" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Confirm
          </Button>
          <Button size="lg" variant="secondary" className="h-11" onClick={() => setEditing(true)} disabled={editing || busy !== null}>
            <Pencil /> Edit
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="h-11"
            disabled={busy !== null}
            onClick={() => run("reject", () => rejectReport(report.id), () => setPhase("done"))}
          >
            Reject
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          {clarify ? (
            <>
              <Button size="lg" className="h-11" onClick={startOver} disabled={busy !== null}>
                <RotateCcw /> Answer by voice
              </Button>
              <Button size="lg" variant="secondary" className="h-11" onClick={() => setEditing(true)} disabled={editing || busy !== null}>
                <Pencil /> Correct by typing
              </Button>
            </>
          ) : (
            <Button size="lg" variant="secondary" className="h-11" onClick={startOver}>
              Start over
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
