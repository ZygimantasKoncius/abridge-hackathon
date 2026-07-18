"use client";

import { useState } from "react";
import type { ReceiptChip } from "@/lib/receipt";

// Coverage receipt (spec §5.4). After the session the transcript runs through
// extraction and each captured field renders as a chip. Tapping a chip corrects
// it via PATCH /api/entries/[id]. Gap-probing already happened in-session, so
// this screen is pure confirmation + provenance — not a follow-up form.

// Which chip fields the PATCH endpoint accepts, and how to edit each. Mirrors
// ALLOWED_PATHS in the entries PATCH route; anything not listed is read-only.
type EditorKind = "text" | "number" | "select" | "boolean";
interface EditorSpec {
  kind: EditorKind;
  options?: { value: string; label: string }[];
}

const EDITORS: Record<string, EditorSpec> = {
  med_time: { kind: "text" },
  med_taken: { kind: "boolean" },
  wear_off_time: { kind: "text" },
  crash_reported: { kind: "boolean" },
  sleep_hours: { kind: "number" },
  sleep_quality: {
    kind: "select",
    options: [
      { value: "good", label: "good" },
      { value: "fair", label: "fair" },
      { value: "poor", label: "poor" },
    ],
  },
  "appetite.status": {
    kind: "select",
    options: [
      { value: "normal", label: "normal" },
      { value: "reduced", label: "reduced" },
      { value: "increased", label: "increased" },
    ],
  },
  "mood.valence": { kind: "text" },
  "caffeine_alcohol_cannabis.detail": { kind: "text" },
};

export function CoverageReceipt({
  entryId,
  initialChips,
}: {
  entryId: string;
  initialChips: ReceiptChip[];
}) {
  const [chips, setChips] = useState<ReceiptChip[]>(initialChips);
  const [corrected, setCorrected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEditor(chip: ReceiptChip) {
    if (!EDITORS[chip.field]) return; // read-only chip
    setEditing(chip.field);
    setDraft(String(chip.value));
    setError(null);
  }

  async function save(field: string) {
    const spec = EDITORS[field];
    let value: string | number | boolean = draft;
    if (spec.kind === "number") {
      const n = Number(draft);
      if (Number.isNaN(n)) {
        setError("Enter a number");
        return;
      }
      value = n;
    } else if (spec.kind === "boolean") {
      value = draft === "true";
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corrections: { [field]: value } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Could not save the correction.");
      setChips(json.chips as ReceiptChip[]);
      setCorrected((prev) => new Set(prev).add(field));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="reveal">
      <p className="eyebrow mb-2">Here&apos;s what I logged</p>
      <p className="text-sm text-ink-muted mb-5">
        Tap anything that isn&apos;t right to fix it. Everything here is drafted from
        your own words.
      </p>

      <ul className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const editable = Boolean(EDITORS[chip.field]);
          const isCorrected = corrected.has(chip.field);
          return (
            <li key={chip.field}>
              <button
                type="button"
                onClick={() => openEditor(chip)}
                disabled={!editable}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                  editable
                    ? "border-line-strong bg-surface hover:border-primary hover:text-primary-ink cursor-pointer"
                    : "border-line bg-surface-sunken text-ink-muted cursor-default"
                } ${isCorrected ? "border-primary text-primary-ink" : "text-ink"}`}
                aria-label={editable ? `Edit: ${chip.label}` : chip.label}
              >
                {chip.label}
                {isCorrected && (
                  <span className="text-[0.65rem] font-mono uppercase tracking-wide text-primary">
                    fixed
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {editing && (
        <ChipEditor
          field={editing}
          spec={EDITORS[editing]}
          value={draft}
          onChange={setDraft}
          onSave={() => save(editing)}
          onCancel={() => {
            setEditing(null);
            setError(null);
          }}
          saving={saving}
          error={error}
        />
      )}
    </div>
  );
}

function ChipEditor({
  field,
  spec,
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
}: {
  field: string;
  spec: EditorSpec;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <div className="mt-4 rounded-[var(--radius-card)] border border-line-strong bg-surface p-4 reveal">
      <label className="eyebrow block mb-2">{field.replace(/[._]/g, " ")}</label>
      <div className="flex items-center gap-2">
        {spec.kind === "select" ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary outline-none"
          >
            {spec.options!.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : spec.kind === "boolean" ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary outline-none"
          >
            <option value="true">yes</option>
            <option value="false">no</option>
          </select>
        ) : (
          <input
            type={spec.kind === "number" ? "number" : "text"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
            className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink focus:border-primary outline-none w-40"
          />
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-white hover:bg-primary-ink transition-colors disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-alert">{error}</p>}
    </div>
  );
}
