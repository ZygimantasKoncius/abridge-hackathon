"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate, relativeDay } from "@/lib/digest";

interface PatientSummary {
  id: string;
  name: string;
  medication: string;
  dose: string | null;
  last_entry: string | null;
  journaled_days: number;
  adherence_pct: number;
  has_red_flag: boolean;
}

export default function ProviderHome() {
  const [rows, setRows] = useState<PatientSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/patients")
      .then((r) => r.json())
      .then((d) => setRows(d.patients ?? []))
      .catch(() => setRows([]));
  }, []);

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

      {rows === null ? (
        <p className="text-sm text-ink-faint font-mono">Loading panel…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No patients yet. Run <code>npm run seed</code> to populate synthetic data.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/provider/${r.id}`}
                className="group flex items-center gap-5 bg-surface border border-line rounded-[var(--radius-card)] px-5 py-4 hover:border-line-strong hover:shadow-[0_1px_0_var(--color-line-strong)] transition-all"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    r.has_red_flag ? "bg-alert" : "bg-line-strong"
                  }`}
                  aria-label={r.has_red_flag ? "Safety flag present" : "No flags"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-semibold text-ink truncate">{r.name}</span>
                    <span className="text-xs text-ink-faint truncate">
                      {[r.medication, r.dose].filter(Boolean).join(" ")}
                    </span>
                  </div>
                  <span className="text-xs text-ink-muted font-mono">
                    last check-in {r.last_entry ? formatDate(r.last_entry) : "—"}
                    {r.last_entry ? ` · ${relativeDay(r.last_entry)}` : ""}
                  </span>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-ink tnum">
                    {r.adherence_pct}%
                  </div>
                  <div className="text-[0.7rem] text-ink-faint uppercase tracking-wide">
                    adherence
                  </div>
                </div>

                <div className="text-right shrink-0 w-16">
                  <div className="text-sm font-semibold text-ink tnum">
                    {r.journaled_days}
                  </div>
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
      )}
    </div>
  );
}
