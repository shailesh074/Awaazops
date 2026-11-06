"use client";

import { useState } from "react";
import { CheckCircle2, CircleSlash, Info, MapPin, Package, Pencil, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EvidenceInspector } from "@/components/shared/evidence-inspector";
import { ValidationChecklist } from "@/components/shared/validation-checklist";
import { ProviderBadge } from "@/components/shared/provider-badge";
import { OrderStatusPill, ReportStatusPill } from "@/components/shared/status-pill";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { runDemoPipeline, type DemoStageId } from "@/lib/demo/pipeline";
import { ACTION_LABELS, type EvidenceFieldKey } from "@/lib/labels";
import { formatSlot } from "@/lib/format";
import type { ExtractionPayload, LanguageCode, ReportDetail, ReportStatus } from "@/domain";
import { AGENT_SCENARIOS } from "@/mocks/agent-scenarios";
import { ComposeStep } from "./compose-step";
import { ProcessingStep } from "./processing-step";
import { VoicePromptCard } from "./voice-prompt-card";
import { EditActionForm, type ActionEdit } from "./edit-action-form";

type Phase = "compose" | "processing" | "review" | "done";

interface Review {
  detail: ReportDetail;
  payload: ExtractionPayload;
  edited: EvidenceFieldKey[];
  usedRecording: boolean;
}

export function ReportFlow() {
  const recorder = useAudioRecorder();
  const [phase, setPhase] = useState<Phase>("compose");
  const [language, setLanguage] = useState<LanguageCode>("hi-en");
  const [scenarioId, setScenarioId] = useState(AGENT_SCENARIOS[0].id);
  const [stage, setStage] = useState<DemoStageId | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [editing, setEditing] = useState(false);
  const [outcome, setOutcome] = useState<"confirmed" | "rejected" | null>(null);

  const submit = async () => {
    setPhase("processing");
    const detail = await runDemoPipeline(scenarioId, setStage);
    setStage(null);
    setReview({
      detail,
      payload: detail.extraction!.payload,
      edited: [],
      usedRecording: recorder.audio !== null,
    });
    setPhase("review");
  };

  const startOver = () => {
    recorder.reset();
    setReview(null);
    setEditing(false);
    setOutcome(null);
    setPhase("compose");
  };

  if (phase === "compose") {
    return (
      <ComposeStep
        language={language}
        onLanguage={setLanguage}
        recorder={recorder}
        scenarioId={scenarioId}
        onScenario={setScenarioId}
        onSubmit={submit}
      />
    );
  }

  if (phase === "processing" || !review) return <ProcessingStep current={stage} />;

  const { detail, payload, edited } = review;
  const validation = detail.validation!;
  const status: ReportStatus = edited.length
    ? "EDITED"
    : validation.outcome === "VERIFIED"
      ? "AWAITING_CONFIRMATION"
      : validation.outcome === "REJECTED"
        ? "REJECTED"
        : "NEEDS_CLARIFICATION";
  const action = payload.requestedAction.value;

  if (phase === "done") {
    const confirmed = outcome === "confirmed";
    return (
      <section className="space-y-5 rounded-2xl border bg-surface p-6 text-center">
        <span
          className={`mx-auto grid size-14 place-items-center rounded-full ${confirmed ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
        >
          {confirmed ? <CheckCircle2 className="size-7" /> : <CircleSlash className="size-7" />}
        </span>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{confirmed ? "Action confirmed" : "Report discarded"}</h2>
          <p className="text-sm text-muted-foreground">
            {confirmed && action
              ? `${ACTION_LABELS[action]} · ${detail.order?.id ?? ""}`
              : "No changes were made to the order."}
          </p>
        </div>
        {confirmed ? (
          <p className="rounded-lg border border-simulated/25 bg-simulated/[0.06] px-3 py-2 text-xs text-simulated">
            Demo mode: this confirmation is not saved yet. Persistence and the audit trail arrive with the backend.
          </p>
        ) : null}
        <Button className="w-full" onClick={startOver}>
          Report another issue
        </Button>
      </section>
    );
  }

  const saveEdit = (e: ActionEdit) => {
    const next: ExtractionPayload = {
      ...payload,
      requestedAction: { value: e.action, evidence: null, confidence: 1 },
      notes: { value: e.notes || null, evidence: null, confidence: 1 },
    };
    const changed: EvidenceFieldKey[] = [];
    if (e.action !== payload.requestedAction.value) changed.push("requestedAction");
    if ((e.notes || null) !== payload.notes.value) changed.push("notes");
    setReview({ ...review, payload: next, edited: [...new Set([...edited, ...changed])] });
    setEditing(false);
    // Demo: re-verification is a no-op here; the real engine re-runs checks on edited payloads (step 6).
  };

  const promptText =
    edited.length && action
      ? `Order ${payload.orderReference.value}: ${ACTION_LABELS[action]}. Confirm karun?`
      : (detail.confirmationPrompt ?? "");

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{detail.report.id}</span>
          <ReportStatusPill status={status} />
        </div>
        <Button variant="ghost" size="sm" onClick={startOver}>
          <X /> Discard
        </Button>
      </div>

      {review.usedRecording ? (
        <p className="flex items-start gap-2 rounded-lg border border-simulated/25 bg-simulated/[0.06] px-3 py-2 text-xs text-simulated">
          <Info className="mt-px size-3.5 shrink-0" />
          Your recording was not transcribed: speech-to-text is not connected. The transcript below is the
          scripted demo scenario.
        </p>
      ) : null}

      <VoicePromptCard
        text={validation.outcome === "VERIFIED" ? promptText : (validation.clarificationQuestion ?? "")}
        tone={validation.outcome === "VERIFIED" ? "confirm" : validation.outcome === "REJECTED" ? "blocked" : "clarify"}
      />

      {editing && action ? (
        <EditActionForm
          initial={{ action, notes: payload.notes.value ?? "" }}
          onSave={saveEdit}
          onCancel={() => setEditing(false)}
        />
      ) : null}

      {detail.order ? (
        <section className="rounded-2xl border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 font-mono text-sm">
              <Package className="size-3.5 text-muted-foreground" /> {detail.order.id}
            </p>
            <OrderStatusPill status={detail.order.status} />
          </div>
          <p className="text-sm">{detail.order.customerName}</p>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 size-3 shrink-0" />
            {detail.order.addressLine}, {detail.order.locality} · slot{" "}
            {formatSlot(detail.order.slotStart, detail.order.slotEnd)}
          </p>
        </section>
      ) : null}

      <EvidenceInspector
        transcript={detail.transcript!.text}
        payload={payload}
        editedFields={edited}
        transcriptAside={<ProviderBadge provenance={detail.transcript!.provenance} />}
      />

      <ValidationChecklist validation={validation} compact />

      {validation.outcome === "VERIFIED" ? (
        <div className="sticky bottom-16 z-10 -mx-4 grid grid-cols-[1fr_auto_auto] gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur">
          <Button
            size="lg"
            className="h-11"
            onClick={() => {
              setOutcome("confirmed");
              setPhase("done");
              toast.success("Action confirmed (demo — not saved)");
            }}
          >
            <CheckCircle2 /> Confirm
          </Button>
          <Button size="lg" variant="secondary" className="h-11" onClick={() => setEditing(true)} disabled={editing}>
            <Pencil /> Edit
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="h-11"
            onClick={() => {
              setOutcome("rejected");
              setPhase("done");
            }}
          >
            Reject
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          {validation.outcome === "NEEDS_CLARIFICATION" ? (
            <Button size="lg" className="h-11" onClick={startOver}>
              <RotateCcw /> Answer by voice
            </Button>
          ) : null}
          <Button size="lg" variant="secondary" className="h-11" onClick={startOver}>
            Start over
          </Button>
        </div>
      )}
    </div>
  );
}
