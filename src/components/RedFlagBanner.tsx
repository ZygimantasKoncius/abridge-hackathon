import type { RedFlagHit } from "@/lib/digest";
import { formatDate } from "@/lib/digest";
import { RED_FLAG_LABELS } from "@/lib/asrs";

// The reserved safety channel (§4). Never summarized, never in the narrative —
// routed to its own UI element with the raw quote and timestamp.
export function RedFlagBanner({ flags }: { flags: RedFlagHit[] }) {
  if (flags.length === 0) return null;

  return (
    <section
      role="alert"
      className="rounded-[var(--radius-card)] border border-alert-line bg-alert-soft overflow-hidden reveal"
    >
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-alert-line">
        <span
          className="inline-block w-2 h-2 rounded-full bg-alert"
          aria-hidden
        />
        <span className="eyebrow" style={{ color: "var(--color-alert)" }}>
          Safety flag — review before visit
        </span>
      </div>
      <ul className="divide-y divide-alert-line">
        {flags.map((f, i) => (
          <li key={i} className="px-5 py-3.5">
            <div className="flex items-baseline justify-between gap-4 mb-1.5">
              <span className="text-sm font-semibold" style={{ color: "var(--color-alert)" }}>
                {RED_FLAG_LABELS[f.type] ?? f.type}
              </span>
              <span className="font-mono text-xs text-ink-muted shrink-0 tabular-nums">
                {formatDate(f.date)} · {f.relative}
              </span>
            </div>
            <p className="font-mono text-[0.8125rem] text-ink leading-relaxed border-l-2 border-alert pl-3">
              “{f.evidence}”
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
