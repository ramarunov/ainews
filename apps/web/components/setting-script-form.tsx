"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";
import type { ScriptSlot } from "@/lib/types";

// Shared enabled-checkbox + raw HTML/script textarea form, used by both the
// "Ad Widgets" section (System Settings, per-slot generic Setting keys) and
// the "Custom Scripts" section (Site Settings, one combined header/footer
// key) — decoupled from how the value is actually persisted so each caller
// can wire its own save path.
export function SettingScriptForm({
  idPrefix,
  label,
  description,
  placeholder = "Paste raw HTML/script tag here…",
  initial,
  onSave,
}: {
  idPrefix: string;
  label: string;
  description: string;
  placeholder?: string;
  initial: ScriptSlot;
  onSave: (value: ScriptSlot) => Promise<unknown>;
}) {
  // Seeded once from `initial` at mount — callers only render this after
  // their own query has already resolved, so there's no later async update
  // to resync from (no effect needed).
  const [html, setHtml] = useState(initial.html);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ enabled, html });
      toast.success(`${label} saved`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor={idPrefix}>{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-enabled`}
            checked={enabled}
            onCheckedChange={(v) => setEnabled(!!v)}
          />
          <Label htmlFor={`${idPrefix}-enabled`} className="text-sm font-normal">
            Enabled
          </Label>
        </div>
      </div>
      <Textarea
        id={idPrefix}
        rows={4}
        placeholder={placeholder}
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        className="font-mono text-xs"
      />
      <Button variant="outline" size="sm" className="self-end" disabled={saving} onClick={handleSave}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
