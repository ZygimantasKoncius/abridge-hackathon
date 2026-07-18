import type { Entry, Patient, RedFlagType } from "./types";
import {
  ASRS_ITEMS,
  bucketFrequency,
  type AsrsFrequency,
  type AsrsItemDef,
} from "./asrs";

// Fixed "today" keeps daysAgo / windows deterministic for the demo.
export const REFERENCE_TODAY = "2026-07-18";

function daysBetween(a: string, b: string): number {
  const ms = new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime();
  return Math.round(ms / 86_400_000);
}

function shiftDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** "2:30pm" → minutes since midnight (null if unparseable). */
export function parseTime(t: string | null): number | null {
  if (!t) return null;
  const m = t.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!m) return null;
  let h = parseInt(m[1], 10) % 12;
  if (m[3] === "pm") h += 12;
  return h * 60 + (m[2] ? parseInt(m[2], 10) : 0);
}

export function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function relativeDay(iso: string): string {
  const d = daysBetween(iso, REFERENCE_TODAY);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

// --- metric primitives -------------------------------------------------------

export type Sentiment = "good" | "warn" | "neutral";
export interface Delta {
  label: string;
  value: string;
  detail: string | null;
  direction: "up" | "down" | "flat";
  sentiment: Sentiment;
}

export interface HistogramBin {
  label: string;
  count: number;
}

export interface AsrsDraft extends AsrsItemDef {
  count: number;
  frequency: AsrsFrequency;
  evidence: { date: string; snippet: string }[];
}

export interface SparklinePoint {
  date: string;
  value: number | null;
}

export interface RedFlagHit {
  type: RedFlagType;
  evidence: string;
  date: string;
  relative: string;
}

export interface AgendaItem {
  text: string;
  count: number;
}

export interface Analysis {
  overview: string | null; // null → renders the quiet "no significant changes" line
  recommendation: { text: string; stat: string } | null;
}

export interface Digest {
  patient: Patient;
  entryCount: number;
  medicatedDays: number;
  adherence: number; // 0..1 overall
  deltas: Delta[];
  wearOff: {
    reported: number;
    ofMedicated: number;
    bins: HistogramBin[];
    modalLabel: string | null;
    modalTime: string | null;
  };
  asrs: AsrsDraft[];
  sparklines: {
    sleep: SparklinePoint[];
    mood: SparklinePoint[];
    appetite: SparklinePoint[];
  };
  redFlags: RedFlagHit[];
  agenda: AgendaItem[];
  analysis: Analysis;
}

const MOOD_SCORE: Record<string, number> = {
  positive: 1,
  neutral: 0,
  flat: -0.5,
  anxious: -0.5,
  irritable: -1,
};

// --- window helpers ----------------------------------------------------------

function splitWindows(entries: Entry[]): { recent: Entry[]; prior: Entry[] } {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1]?.date ?? REFERENCE_TODAY;
  const recentStart = shiftDays(last, -13); // last 14 days inclusive
  const priorStart = shiftDays(last, -27);
  return {
    recent: sorted.filter((e) => e.date >= recentStart),
    prior: sorted.filter((e) => e.date >= priorStart && e.date < recentStart),
  };
}

function adherenceOf(entries: Entry[]): number {
  if (entries.length === 0) return 0;
  const med = entries.filter((e) => e.extraction.med_taken === true).length;
  return med / entries.length;
}

function avgSleep(entries: Entry[]): number | null {
  const vals = entries
    .map((e) => e.extraction.sleep_hours)
    .filter((v): v is number => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function reducedAppetiteRate(entries: Entry[]): number {
  if (!entries.length) return 0;
  const n = entries.filter((e) => e.extraction.appetite?.status === "reduced").length;
  return n / entries.length;
}

// --- the digest --------------------------------------------------------------

export function computeDigest(patient: Patient): Digest {
  const entries = [...patient.entries].sort((a, b) => a.date.localeCompare(b.date));
  const { recent, prior } = splitWindows(entries);

  const medicatedDays = entries.filter((e) => e.extraction.med_taken === true).length;
  const adherence = adherenceOf(entries);

  // ----- headline deltas -----
  const adhRecent = adherenceOf(recent);
  const adhPrior = adherenceOf(prior);
  const sleepRecent = avgSleep(recent);
  const sleepPrior = avgSleep(prior);
  const appRecent = reducedAppetiteRate(recent);
  const appPrior = reducedAppetiteRate(prior);

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const dir = (d: number): Delta["direction"] =>
    Math.abs(d) < 0.001 ? "flat" : d > 0 ? "up" : "down";

  const deltas: Delta[] = [
    {
      label: "Adherence",
      value: pct(adherence),
      detail: prior.length ? `${pct(adhPrior)} prior 14d` : null,
      direction: dir(adhRecent - adhPrior),
      sentiment: adhRecent >= adhPrior ? "good" : "warn",
    },
    {
      label: "Avg sleep",
      value: sleepRecent != null ? `${sleepRecent.toFixed(1)}h` : "—",
      detail: sleepPrior != null ? `${sleepPrior.toFixed(1)}h prior 14d` : null,
      direction: dir((sleepRecent ?? 0) - (sleepPrior ?? 0)),
      // less sleep is the concerning direction
      sentiment: (sleepRecent ?? 0) >= (sleepPrior ?? 0) ? "good" : "warn",
    },
    {
      label: "Reduced-appetite days",
      value: pct(appRecent),
      detail: `${pct(appPrior)} prior 14d`,
      direction: dir(appRecent - appPrior),
      sentiment: appRecent <= appPrior ? "good" : "warn",
    },
  ];

  // ----- wear-off histogram (the money chart) -----
  const wearTimes = entries
    .map((e) => parseTime(e.extraction.wear_off_time))
    .filter((v): v is number => v != null);
  const binDefs: { label: string; lo: number; hi: number }[] = [
    { label: "12–1p", lo: 12 * 60, hi: 13 * 60 },
    { label: "1–2p", lo: 13 * 60, hi: 14 * 60 },
    { label: "2–3p", lo: 14 * 60, hi: 15 * 60 },
    { label: "3–4p", lo: 15 * 60, hi: 16 * 60 },
    { label: "4–5p", lo: 16 * 60, hi: 17 * 60 },
    { label: "5p+", lo: 17 * 60, hi: 24 * 60 },
  ];
  const bins: HistogramBin[] = binDefs.map((b) => ({
    label: b.label,
    count: wearTimes.filter((t) => t >= b.lo && t < b.hi).length,
  }));
  const modal = bins.reduce<HistogramBin | null>(
    (best, b) => (best == null || b.count > best.count ? b : best),
    null,
  );
  // representative time = median of the modal bin's entries
  let modalTime: string | null = null;
  if (modal && modal.count > 0) {
    const idx = binDefs.findIndex((b) => b.label === modal.label);
    const inBin = wearTimes
      .filter((t) => t >= binDefs[idx].lo && t < binDefs[idx].hi)
      .sort((a, b) => a - b);
    const mid = inBin[Math.floor(inBin.length / 2)];
    const h = Math.floor(mid / 60);
    const mm = mid % 60;
    const h12 = ((h + 11) % 12) + 1;
    modalTime = `${h12}:${mm.toString().padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;
  }

  // ----- ASRS-18 draft -----
  const asrs: AsrsDraft[] = ASRS_ITEMS.map((def) => {
    const evidence: { date: string; snippet: string }[] = [];
    for (const e of entries) {
      for (const s of e.extraction.asrs_signals) {
        if (s.item === def.item) evidence.push({ date: e.date, snippet: s.evidence });
      }
    }
    return {
      ...def,
      count: evidence.length,
      frequency: bucketFrequency(evidence.length),
      evidence,
    };
  });

  // ----- sparklines -----
  const sleep: SparklinePoint[] = entries.map((e) => ({
    date: e.date,
    value: e.extraction.sleep_hours,
  }));
  const mood: SparklinePoint[] = entries.map((e) => ({
    date: e.date,
    value: e.extraction.mood ? (MOOD_SCORE[e.extraction.mood.valence] ?? 0) : null,
  }));
  const appetite: SparklinePoint[] = entries.map((e) => ({
    date: e.date,
    value:
      e.extraction.appetite == null
        ? null
        : e.extraction.appetite.status === "reduced"
          ? -1
          : e.extraction.appetite.status === "increased"
            ? 1
            : 0,
  }));

  // ----- red flags (separate channel, most recent first) -----
  const redFlags: RedFlagHit[] = entries
    .flatMap((e) =>
      e.extraction.red_flags.map((f) => ({
        type: f.type,
        evidence: f.evidence,
        date: e.date,
        relative: relativeDay(e.date),
      })),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  // ----- agenda aggregation -----
  const agendaMap = new Map<string, number>();
  for (const e of entries) {
    for (const item of e.extraction.visit_agenda_items) {
      agendaMap.set(item, (agendaMap.get(item) ?? 0) + 1);
    }
  }
  const agenda: AgendaItem[] = [...agendaMap.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count);

  const analysis = computeAnalysis({
    sleepRecent,
    sleepPrior,
    wearOffReported: wearTimes.length,
    medicatedDays,
    modalTime,
    modalCount: modal?.count ?? 0,
    losingCount: asrs.find((a) => a.item === 7)?.count ?? 0,
    finishingCount: asrs.find((a) => a.item === 1)?.count ?? 0,
  });

  return {
    patient,
    entryCount: entries.length,
    medicatedDays,
    adherence,
    deltas,
    wearOff: {
      reported: wearTimes.length,
      ofMedicated: medicatedDays,
      bins,
      modalLabel: modal?.count ? modal.label : null,
      modalTime,
    },
    asrs,
    sparklines: { sleep, mood, appetite },
    redFlags,
    agenda,
    analysis,
  };
}

// Rule-based stand-in for the render-time Claude analysis call (§6). Stats in,
// prose out — the model never invents numbers. Stays quiet when nothing sticks
// out ("silence is a feature"). Wording guardrail: always "consider discussing".
function computeAnalysis(s: {
  sleepRecent: number | null;
  sleepPrior: number | null;
  wearOffReported: number;
  medicatedDays: number;
  modalTime: string | null;
  modalCount: number;
  losingCount: number;
  finishingCount: number;
}): Analysis {
  const sleepDrop =
    s.sleepPrior != null && s.sleepRecent != null && s.sleepPrior - s.sleepRecent >= 1;
  const wearPattern = s.modalCount >= 4 && s.modalTime != null;

  if (!sleepDrop && !wearPattern) {
    return { overview: null, recommendation: null };
  }

  const clauses: string[] = [];
  if (sleepDrop) {
    clauses.push(
      `Sleep has declined from ~${s.sleepPrior!.toFixed(1)}h to ~${s.sleepRecent!.toFixed(
        1,
      )}h over the past two weeks`,
    );
  }
  if (wearPattern) {
    const lead = sleepDrop ? ", coinciding with" : "There is";
    clauses.push(
      `${lead} a consistent mid-afternoon wear-off pattern (${s.wearOffReported} of ${s.medicatedDays} medicated days near ${s.modalTime})`,
    );
  }
  let overview = clauses.join("") + ".";
  if (s.losingCount + s.finishingCount >= 5) {
    overview += ` Symptom mentions in the losing-things and task-completion domains rose over the same window (${
      s.losingCount + s.finishingCount
    } mentions).`;
  }

  let recText: string;
  let stat: string;
  if (wearPattern && sleepDrop) {
    recText =
      "Consider discussing an XR formulation or an afternoon booster; the sleep trend may warrant addressing before any dose change.";
    stat = `wears off near ${s.modalTime} on ${s.wearOffReported}/${s.medicatedDays} medicated days · sleep ${s.sleepPrior?.toFixed(
      1,
    )}h → ${s.sleepRecent?.toFixed(1)}h`;
  } else if (wearPattern) {
    recText =
      "Consider discussing a longer-acting formulation or an afternoon booster to close the coverage gap.";
    stat = `wears off near ${s.modalTime} on ${s.wearOffReported}/${s.medicatedDays} medicated days`;
  } else {
    recText =
      "Consider a sleep conversation — hygiene first, and a confounder workup if the trend persists.";
    stat = `sleep ${s.sleepPrior?.toFixed(1)}h → ${s.sleepRecent?.toFixed(1)}h over two weeks`;
  }

  return { overview, recommendation: { text: recText, stat } };
}
