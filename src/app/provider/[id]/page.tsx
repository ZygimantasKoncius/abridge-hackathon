"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { computeDigest, formatDate, type Analysis } from "@/lib/digest";
import type { Patient } from "@/lib/types";
import { AnalysisBlock } from "@/components/AnalysisBlock";
import { RedFlagBanner } from "@/components/RedFlagBanner";
import { WearOffHistogram } from "@/components/WearOffHistogram";
import { AsrsGrid } from "@/components/AsrsGrid";
import { Sparkline } from "@/components/Sparkline";
import { Card, CardHead, TrendArrow } from "@/components/ui";

interface DigestResponse {
  patient: Patient;
  analysis: Analysis | null;
}

export default function PatientDigest() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  // undefined = loading, null = not found
  const [data, setData] = useState<DigestResponse | null | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    let live = true;
    fetch(`/api/patients/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setData(d))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [id]);

  const d = useMemo(() => (data?.patient ? computeDigest(data.patient) : null), [data]);

  if (data === undefined) {
    return <p className="text-sm text-ink-faint font-mono">Loading digest…</p>;
  }
  if (!data || !d) {
    return (
      <div>
        <Link href="/provider" className="text-xs text-ink-muted hover:text-ink">
          ← All patients
        </Link>
        <p className="mt-4 text-sm text-ink-faint">Patient not found.</p>
      </div>
    );
  }

  const patient = data.patient;
  // Override the client rule-based analysis with the cached LLM analysis (§6).
  if (data.analysis) d.analysis = data.analysis;

  const first = patient.entries[0]?.date ?? "";
  const last = patient.entries[patient.entries.length - 1]?.date ?? "";
  const observedItems = d.asrs.filter((a) => a.count > 0).length;

  return (
    <div className="space-y-8">
      {/* Patient header */}
      <div>
        <Link
          href="/provider"
          className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors mb-4"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M7 2L3 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All patients
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-semibold text-ink tracking-tight">{patient.name}</h1>
          <span className="text-sm text-ink-muted">{patient.age}y</span>
          <span className="font-mono text-xs text-ink-muted">{patient.medication}</span>
        </div>
        <p className="mt-1 text-xs text-ink-faint font-mono">
          {d.entryCount} check-ins · {formatDate(first)}–{formatDate(last)} ·{" "}
          {d.medicatedDays} medicated days
        </p>
      </div>

      {/* Safety channel — separate from everything below */}
      <RedFlagBanner flags={d.redFlags} />

      {/* Above the fold: drafted analysis */}
      <AnalysisBlock analysis={d.analysis} />

      {/* Headline deltas */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {d.deltas.map((delta) => (
          <div
            key={delta.label}
            className="bg-surface border border-line rounded-[var(--radius-card)] px-4 py-3.5"
          >
            <p className="text-xs text-ink-muted mb-1.5">{delta.label}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-ink tnum tracking-tight">
                {delta.value}
              </span>
              <TrendArrow direction={delta.direction} sentiment={delta.sentiment} />
            </div>
            {delta.detail && (
              <p className="mt-1 font-mono text-[0.7rem] text-ink-faint tabular-nums">
                {delta.detail}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* The money chart */}
      <Card className="p-6">
        <CardHead
          eyebrow="Coverage pattern"
          title="When the medication wears off"
          aside={
            <span className="font-mono text-xs text-ink-faint">
              {d.wearOff.reported} of {d.wearOff.ofMedicated} days reported
            </span>
          }
        />
        <WearOffHistogram wearOff={d.wearOff} />
      </Card>

      {/* ASRS-18 draft */}
      <Card className="p-6">
        <CardHead
          eyebrow="ASRS-18 · draft for provider confirmation"
          title="Auto-drafted symptom review"
          aside={
            <span className="font-mono text-xs text-ink-faint">
              {observedItems}/18 items observed
            </span>
          }
        />
        <p className="text-sm text-ink-muted -mt-2 mb-5 max-w-2xl">
          Frequencies derive from signal counts across the month. Click any observed item
          to see the dated quotes behind it. Unobserved items are flagged to ask in-visit —
          never silently marked absent.
        </p>
        <AsrsGrid items={d.asrs} />
      </Card>

      {/* Sparklines + agenda */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="p-6 md:col-span-2">
          <CardHead eyebrow="30-day trends" title="Sleep, mood, appetite" />
          <div className="space-y-5">
            <TrendRow label="Sleep (hrs)" note={`${d.sparklines.sleep.at(-1)?.value ?? "—"}h last night`}>
              <Sparkline points={d.sparklines.sleep} domain={[4, 9]} />
            </TrendRow>
            <TrendRow label="Mood" note="irritable ↔ positive">
              <Sparkline
                points={d.sparklines.mood}
                domain={[-1, 1]}
                color="var(--color-warn)"
              />
            </TrendRow>
            <TrendRow label="Appetite" note="reduced ↔ normal">
              <Sparkline
                points={d.sparklines.appetite}
                domain={[-1, 1]}
                color="var(--color-ink-muted)"
              />
            </TrendRow>
          </div>
        </Card>

        <Card className="p-6">
          <CardHead eyebrow="From the patient" title="Visit agenda" />
          {d.agenda.length === 0 ? (
            <p className="text-sm text-ink-faint">No agenda items raised this month.</p>
          ) : (
            <ul className="space-y-3">
              {d.agenda.map((a, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-mono text-xs text-primary-ink pt-0.5 tabular-nums shrink-0">
                    {a.count}×
                  </span>
                  <span className="text-sm text-ink leading-snug">{a.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function TrendRow({
  label,
  note,
  children,
}: {
  label: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-24 shrink-0">
        <p className="text-sm text-ink font-medium">{label}</p>
        <p className="text-[0.7rem] text-ink-faint">{note}</p>
      </div>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  );
}
