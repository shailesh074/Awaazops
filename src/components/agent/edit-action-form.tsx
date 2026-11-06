"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTION_TYPES, type ActionType } from "@/domain";
import { ACTION_LABELS } from "@/lib/labels";

export interface ActionEdit {
  orderReference?: string;
  requestedAction?: ActionType;
  notes?: string | null;
}

/** Agent corrections. Only changed fields are sent; the server re-verifies before confirmation is possible. */
export function EditActionForm({
  initial,
  onSave,
  onCancel,
  busy,
}: {
  initial: { orderReference: string; requestedAction: ActionType | null; notes: string };
  onSave: (edit: ActionEdit) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [orderRef, setOrderRef] = useState(initial.orderReference);
  const [action, setAction] = useState<ActionType | "">(initial.requestedAction ?? "");
  const [notes, setNotes] = useState(initial.notes);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const edit: ActionEdit = {};
    if (orderRef.trim() && orderRef.trim() !== initial.orderReference) edit.orderReference = orderRef.trim();
    if (action && action !== initial.requestedAction) edit.requestedAction = action;
    if (notes.trim() !== initial.notes) edit.notes = notes.trim() || null;
    if (Object.keys(edit).length === 0) return onCancel();
    onSave(edit);
  };

  return (
    <form className="space-y-4 rounded-2xl border bg-surface p-4" onSubmit={submit}>
      <h2 className="text-sm font-medium">Correct the details</h2>
      <div className="space-y-1.5">
        <Label htmlFor="edit-order">Order number</Label>
        <Input
          id="edit-order"
          inputMode="numeric"
          value={orderRef}
          onChange={(e) => setOrderRef(e.target.value)}
          placeholder="e.g. 4821"
          className="font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-action">Action</Label>
        <Select value={action} onValueChange={(v) => setAction(v as ActionType)}>
          <SelectTrigger id="edit-action" className="w-full">
            <SelectValue placeholder="Choose an action" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((a) => (
              <SelectItem key={a} value={a}>
                {ACTION_LABELS[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-notes">Notes for dispatcher</Label>
        <Textarea id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>
      <p className="text-xs text-muted-foreground">Your changes are re-verified before you can confirm.</p>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} Save and re-verify
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
