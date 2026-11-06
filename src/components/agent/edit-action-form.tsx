"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTION_TYPES, type ActionType } from "@/domain";
import { ACTION_LABELS } from "@/lib/labels";

export interface ActionEdit {
  action: ActionType;
  notes: string;
}

export function EditActionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ActionEdit;
  onSave: (edit: ActionEdit) => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState<ActionType>(initial.action);
  const [notes, setNotes] = useState(initial.notes);

  return (
    <form
      className="space-y-4 rounded-2xl border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ action, notes: notes.trim() });
      }}
    >
      <h2 className="text-sm font-medium">Correct the details</h2>
      <div className="space-y-1.5">
        <Label htmlFor="edit-action">Action</Label>
        <Select value={action} onValueChange={(v) => setAction(v as ActionType)}>
          <SelectTrigger id="edit-action" className="w-full">
            <SelectValue />
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
      <p className="text-xs text-muted-foreground">Edited values are re-verified before you can confirm.</p>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          Save and re-verify
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
