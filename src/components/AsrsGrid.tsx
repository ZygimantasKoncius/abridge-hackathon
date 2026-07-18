"use client";

import { useState } from "react";
import type { AsrsDraft } from "@/lib/digest";
import { formatDate } from "@/lib/digest";
import type { AsrsFrequency } from "@/lib/asrs";

const FREQ_STYLE: Record<AsrsFrequency, string> = {
  "Not observed": "text-ink-faint border-line bg-transparent",
  Sometimes: "text-primary-ink border-primary-soft bg-primary-soft",
  Often: "text-white border-primary bg-primary",
  "Very Often": "text-white border-[#0a444c] bg-[#0a444c]",
};

function AsrsRow({ draft }: { draft: AsrsDraft }) {
  const [open, setOpen] = useState(false);
  const hasEvidence = draft.evidence.length > 0;

  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => hasEvidence && setOpen((o) => !o)}
        aria-expanded={hasEvidence ? open : undefined}
        disabled={!hasEvidence}
        className={`w-full flex items-center gap-3 py-2.5 text-left group ${
          hasEvidence ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <span className="font-mono text-xs text-ink-faint w-5 shrink-0 tabular-nums">
          {draft.item.toString().padStart(2, "0")}
        </span>
        <span
          className={`text-sm flex-1 min-w-0 truncate ${
            hasEvidence ? "text-ink" : "text-ink-faint"
          }`}
        >
          {draft.label}
        </span>
        {hasEvidence && (
          <span className="font-mono text-xs text-ink-faint tabular-nums shrink-0">
            {draft.count}×
          </span>
        )}
        <span
          className={`text-xs px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${FREQ_STYLE[draft.frequency]}`}
        >
          {draft.frequency === "Not observed" ? "ask in visit" : draft.frequency}
        </span>
        {hasEvidence && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            className={`text-ink-faint shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
            aria-hidden
          >
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {open && hasEvidence && (
        <ul className="pb-3 pl-8 space-y-1.5">
          {draft.evidence.map((ev, i) => (
            <li key={i} className="flex gap-3 text-sm reveal">
              <span className="font-mono text-xs text-primary-ink pt-0.5 w-12 shrink-0 tabular-nums">
                {formatDate(ev.date)}
              </span>
              <span className="font-mono text-[0.8125rem] text-ink-muted leading-relaxed border-l-2 border-primary-soft pl-3">
                “{ev.snippet}”
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AsrsGrid({ items }: { items: AsrsDraft[] }) {
  const inattention = items.filter((i) => i.domain === "inattention");
  const hyperactivity = items.filter((i) => i.domain === "hyperactivity");

  return (
    <div className="grid md:grid-cols-2 gap-x-10 gap-y-6">
      <Column title="Inattention" items={inattention} />
      <Column title="Hyperactivity / impulsivity" items={hyperactivity} />
    </div>
  );
}

function Column({ title, items }: { title: string; items: AsrsDraft[] }) {
  return (
    <div>
      <h4 className="eyebrow mb-1.5">{title}</h4>
      <div>
        {items.map((d) => (
          <AsrsRow key={d.item} draft={d} />
        ))}
      </div>
    </div>
  );
}
