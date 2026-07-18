import Link from "next/link";
import { PATIENTS } from "@/lib/mock-data";
import { computeDigest, formatDate, relativeDay } from "@/lib/digest";

export default function ProviderHome() {
  const rows = PATIENTS.map((p) => {
    const d = computeDigest(p);
    const lastDate = p.entries[p.entries.length - 1]?.date ?? "";
    return {
      id: p.id,
      name: p.name,
      medication: p.medication,
      adherence: d.adherence,
      lastDate,
      hasFlag: d.redFlags.length > 0,
      entryCount: d.entryCount,
    };
  });

  return (
    <div>
      <div className="mb-8">
        <p className="eyebrow mb-2">Today&apos;s panel · {formatDate("2026-07-18")}</p>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">
          Patients up for follow-up
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted max-w-xl">
          Each digest is drafted from the patient&apos;s daily voice check-ins. Open one
          before the visit — the monthly questionnaire is already filled in, with receipts.
        </p>
      </div>

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/provider/${r.id}`}
              className="group flex items-center gap-5 bg-surface border border-line rounded-[var(--radius-card)] px-5 py-4 hover:border-line-strong hover:shadow-[0_1px_0_var(--color-line-strong)] transition-all"
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  r.hasFlag ? "bg-alert" : "bg-line-strong"
                }`}
                aria-label={r.hasFlag ? "Safety flag present" : "No flags"}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-semibold text-ink truncate">{r.name}</span>
                  <span className="text-xs text-ink-faint truncate">{r.medication}</span>
                </div>
                <span className="text-xs text-ink-muted font-mono">
                  last check-in {formatDate(r.lastDate)} · {relativeDay(r.lastDate)}
                </span>
              </div>

              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-ink tnum">
                  {Math.round(r.adherence * 100)}%
                </div>
                <div className="text-[0.7rem] text-ink-faint uppercase tracking-wide">
                  adherence
                </div>
              </div>

              <div className="text-right shrink-0 w-16">
                <div className="text-sm font-semibold text-ink tnum">{r.entryCount}</div>
                <div className="text-[0.7rem] text-ink-faint uppercase tracking-wide">
                  entries
                </div>
              </div>

              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                className="text-ink-faint group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
                aria-hidden
              >
                <path
                  d="M6 3l5 5-5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
