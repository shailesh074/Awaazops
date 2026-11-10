"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { closeEscalation, resolveEscalation } from "@/lib/api/reports-client";
import { ACTION_LABELS } from "@/lib/labels";
import type { ActionType, Order } from "@/domain";

const ACTIONS = (Object.keys(ACTION_LABELS) as ActionType[]).filter((a) => a !== "ESCALATE_TO_DISPATCHER");

/**
 * Dispatcher resolution of a report the agent sent to dispatch. "Apply" is re-verified on the server exactly
 * like an agent's report (order on the agent's route, action allowed for its status, required fields) and
 * executes only if it passes; "Close" changes nothing and records why.
 */
export function ResolveEscalation({
  reportId,
  agentName,
  routeOrders,
  suggestedAction,
}: {
  reportId: string;
  agentName: string;
  routeOrders: Order[];
  suggestedAction: ActionType | null;
}) {
  const router = useRouter();
  const [orderId, setOrderId] = useState<string>("");
  const [action, setAction] = useState<ActionType | "">(suggestedAction && suggestedAction !== "ESCALATE_TO_DISPATCHER" ? suggestedAction : "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<null | "apply" | "close">(null);

  const go = async (kind: "apply" | "close") => {
    setBusy(kind);
    try {
      if (kind === "apply") {
        const d = await resolveEscalation(reportId, { orderId, requestedAction: action as ActionType, notes: notes.trim() || null });
        if (d.report.status === "EXECUTED") toast.success(`${d.action?.orderId ?? orderId} updated`);
        else toast.error(d.report.failureReason ?? "Not applied.");
      } else {
        await closeEscalation(reportId, notes.trim());
        toast("Closed without changes");
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-pretty text-muted-foreground">
        Link this report to one of {agentName}&apos;s open orders. Your choice is checked against the database before
        anything changes, and is recorded as confirmed by you.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="resolve-order">Order</Label>
        {routeOrders.length ? (
          <Select value={orderId} onValueChange={setOrderId}>
            <SelectTrigger id="resolve-order" className="w-full">
              <SelectValue placeholder="Choose an order" />
            </SelectTrigger>
            <SelectContent>
              {routeOrders.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.id} · {o.customerName} · {o.locality}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground">{agentName} has no open orders — close the report instead.</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="resolve-action">Action</Label>
        <Select value={action} onValueChange={(v) => setAction(v as ActionType)}>
          <SelectTrigger id="resolve-action" className="w-full">
            <SelectValue placeholder="Choose an action" />
          </SelectTrigger>
          <SelectContent>
            {ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {ACTION_LABELS[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="resolve-notes">Note</Label>
        <Textarea
          id="resolve-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Required to close; used as the new instructions for “Update instructions”"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button onClick={() => go("apply")} disabled={busy !== null || !orderId || !action}>
          {busy === "apply" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Apply &amp; confirm
        </Button>
        <Button variant="secondary" onClick={() => go("close")} disabled={busy !== null || notes.trim().length < 3}>
          {busy === "close" ? <Loader2 className="animate-spin" /> : <XCircle />} Close without changes
        </Button>
      </div>
    </div>
  );
}
