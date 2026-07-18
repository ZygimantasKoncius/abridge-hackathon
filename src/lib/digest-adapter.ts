// Maps the backend digest (server-digest.ts, returned by GET /api/digest/[pid])
// onto the exact prop shapes the provider components consume (digest.ts view
// types). This is the seam that lets the UI render the real backend computation
// instead of recomputing in the browser.
//
// Client-safe: server-digest / db types are imported as `import type` only
// (fully erased at build — no better-sqlite3 pulled into the client bundle).

import { ASRS_ITEMS, bucketFrequency } from "./asrs";
import {
  parseTime,
  relativeDay,
  type AgendaItem,
  type AsrsDraft,
  type Delta,
  type RedFlagHit,
  type Sentiment,
  type SparklinePoint,
} from "./digest";
import type { AnalysisResult, Digest as ServerDigest } from "./server-digest";

export interface ProviderView {
  header: {
    name: string;
    medication: string;
    entryCount: number;
    first: string;
    last: string;
    medicatedDays: number;
  };
  deltas: Delta[];
  wearOff: {
    reported: number;
    ofMedicated: number;
    bins: { label: string; count: number }[];
    modalLabel: string | null;
    modalTime: string | null;
  };
  asrs: AsrsDraft[];
  sparklines: { sleep: SparklinePoint[]; mood: SparklinePoint[]; appetite: SparklinePoint[] };
  redFlags: RedFlagHit[];
  agenda: AgendaItem[];
  analysis: { overview: string | null; recommendation: { text: string; stat: string } | null };
}

type Arrow = "up" | "down" | "flat" | null;
const dir = (a: Arrow): Delta["direction"] => (a == null ? "flat" : a);
const pct = (v: number | null): string => `${Math.round((v ?? 0) * 100)}%`;

function delta(
  label: string,
  value: string,
  recent: number | null,
  prior: number | null,
  arrow: Arrow,
  good: "higher" | "lower",
): Delta {
  let sentiment: Sentiment = "neutral";
  if (recent != null && prior != null) {
    const improved = good === "higher" ? recent >= prior : recent <= prior;
    sentiment = improved ? "good" : "warn";
  }
  return {
    label,
    value,
    detail: prior != null ? `${label === "Avg sleep" ? prior.toFixed(1) + "h" : pct(prior)} prior 14d` : null,
    direction: dir(arrow),
    sentiment,
  };
}

// Fixed hour bins matching the tuned WearOffHistogram look. The backend emits
// 30-minute buckets; re-aggregate them into these six.
const BIN_DEFS = [
  { label: "12–1p", lo: 720, hi: 780 },
  { label: "1–2p", lo: 780, hi: 840 },
  { label: "2–3p", lo: 840, hi: 900 },
  { label: "3–4p", lo: 900, hi: 960 },
  { label: "4–5p", lo: 960, hi: 1020 },
  { label: "5p+", lo: 1020, hi: 1440 },
];

export function adaptDigest(sd: ServerDigest): ProviderView {
  // deltas
  const adh = sd.headline.adherence;
  const sleep = sd.headline.avgSleep;
  const app = sd.headline.appetiteReducedRate;
  const deltas: Delta[] = [
    delta("Adherence", `${adh.pct}%`, adh.recent, adh.prior, adh.arrow, "higher"),
    delta(
      "Avg sleep",
      sleep.recent != null ? `${sleep.recent.toFixed(1)}h` : "—",
      sleep.recent,
      sleep.prior,
      sleep.arrow,
      "higher",
    ),
    delta("Reduced-appetite days", pct(app.recent), app.recent, app.prior, app.arrow, "lower"),
  ];

  // wear-off histogram — re-bucket 30-min buckets into fixed hour bins
  const counts = new Map(BIN_DEFS.map((b) => [b.label, 0]));
  for (const hb of sd.wearOff.histogram) {
    const start = hb.label.split(/[–—-]/)[0].trim();
    const mins = parseTime(start);
    if (mins == null) continue;
    const def = BIN_DEFS.find((b) => mins >= b.lo && mins < b.hi);
    if (def) counts.set(def.label, (counts.get(def.label) ?? 0) + hb.count);
  }
  const bins = BIN_DEFS.map((b) => ({ label: b.label, count: counts.get(b.label) ?? 0 }));
  const modal = bins.reduce<{ label: string; count: number } | null>(
    (best, b) => (b.count > (best?.count ?? 0) ? b : best),
    null,
  );

  // ASRS-18 — rebuild from the item defs, filling evidence from backend snippets
  const asrs: AsrsDraft[] = ASRS_ITEMS.map((def) => {
    const s = sd.asrsDraft.find((x) => x.item === def.item);
    const evidence = (s?.snippets ?? []).map((sn) => ({ date: sn.date, snippet: sn.evidence }));
    return { ...def, count: evidence.length, frequency: bucketFrequency(evidence.length), evidence };
  });

  // sparklines — backend mood scale is -2..2; the chart domain is [-1,1]
  const clampMood = (v: number | null) => (v == null ? null : Math.max(-1, Math.min(1, v / 2)));
  const sparklines = {
    sleep: sd.sparklines.sleep,
    mood: sd.sparklines.mood.map((p) => ({ date: p.date, value: clampMood(p.value) })),
    appetite: sd.sparklines.appetite,
  };

  // red flags
  const redFlags: RedFlagHit[] = sd.redFlags.map((f) => ({
    type: f.type,
    evidence: f.evidence,
    date: f.date,
    relative: relativeDay(f.date),
  }));

  // agenda — aggregate repeated items
  const agendaMap = new Map<string, number>();
  for (const a of sd.agenda) agendaMap.set(a.text, (agendaMap.get(a.text) ?? 0) + 1);
  const agenda: AgendaItem[] = [...agendaMap.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count);

  // analysis (AnalysisResult -> view Analysis). Quiet when nothing is notable.
  const a: AnalysisResult | null = sd.analysis;
  const analysis = {
    overview: a && a.notable ? a.overview : null,
    recommendation:
      a && a.notable && a.recommendation && a.recommendation_option !== "continue_current_regimen"
        ? { text: a.recommendation, stat: a.supporting_stat ?? "" }
        : null,
  };

  return {
    header: {
      name: sd.patient.name,
      medication: [sd.patient.medication, sd.patient.dose].filter(Boolean).join(" "),
      entryCount: sd.window.journaledDays,
      first: sd.window.start ?? "",
      last: sd.window.end ?? "",
      medicatedDays: adh.medicatedDays,
    },
    deltas,
    wearOff: {
      reported: sd.wearOff.daysWithWearOff,
      ofMedicated: sd.wearOff.medicatedDays,
      bins,
      modalLabel: modal && modal.count > 0 ? modal.label : null,
      modalTime: sd.headline.wearOffMedian.label,
    },
    asrs,
    sparklines,
    redFlags,
    agenda,
    analysis,
  };
}
