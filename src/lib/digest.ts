import { ASRS_CONSTRUCTS } from "./constructs";
import { PatientRow } from "./db";
import { ExtractionData, RedFlagType } from "./schema";

// Digest math (spec §6) — ALL computed in code, never by the LLM. The model
// only extracts and cites; every number here is derived from extraction rows.
//
// The LLM analysis block (overview + recommendation prose) is deferred in this
// pass; `analysis` is null and the shape is ready for it to slot in later.

export interface DigestEntry {
  entry_id: string;
  entry_date: string; // YYYY-MM-DD
  data: ExtractionData;
}

const WINDOW_DAYS = 30;
const HALF_WINDOW_DAYS = 14; // recent vs prior half, for trend arrows

// --- time parsing --------------------------------------------------------

// "8:15am" | "around 2:30 pm" | "14:30" -> minutes since midnight, or null.
export function parseTimeToMinutes(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3];
  if (hour > 23 || min > 59) return null;
  if (mer === "pm" && hour < 12) hour += 12;
  if (mer === "am" && hour === 12) hour = 0;
  return hour * 60 + min;
}

function minutesToLabel(mins: number): string {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const mer = h >= 12 ? "pm" : "am";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m.toString().padStart(2, "0")}${mer}`;
}

// Map free-text mood valence onto a -2..2 scale for the sparkline.
const VALENCE_SCALE: Record<string, number> = {
  great: 2, good: 2, happy: 2, positive: 2, upbeat: 2,
  calm: 1, content: 1, ok: 1, okay: 1, fine: 1, stable: 1, neutral: 0,
  flat: 0, tired: -1, low: -1, down: -1, sad: -1, irritable: -1,
  anxious: -1, frustrated: -1, stressed: -1, angry: -2, depressed: -2, "very low": -2,
};

function valenceToScore(valence: string | null): number | null {
  if (!valence) return null;
  const key = valence.toLowerCase().trim();
  if (key in VALENCE_SCALE) return VALENCE_SCALE[key];
  // partial match: pick the first known token contained in the phrase
  for (const [k, v] of Object.entries(VALENCE_SCALE)) {
    if (key.includes(k)) return v;
  }
  return 0;
}

// --- digest types --------------------------------------------------------

export interface TrendDelta {
  recent: number | null;
  prior: number | null;
  arrow: "up" | "down" | "flat" | null;
}

export interface AsrsDraftItem {
  item: number;
  construct: string;
  domain: string;
  description: string;
  count: number;
  answer: "not observed" | "Sometimes" | "Often" | "Very Often";
  observed: boolean;
  snippets: { date: string; evidence: string }[];
}

export interface WearOffBucket {
  label: string;
  count: number;
}

export interface SparklinePoint {
  date: string;
  value: number | null;
}

export interface RedFlagHit {
  type: RedFlagType;
  evidence: string;
  date: string;
  daysAgo: number;
}

export interface Digest {
  patient: { id: string; name: string; medication: string | null; dose: string | null };
  window: { days: number; start: string | null; end: string | null; journaledDays: number };
  headline: {
    adherence: { pct: number; medicatedDays: number; journaledDays: number } & TrendDelta;
    avgSleep: TrendDelta;
    appetiteReducedRate: TrendDelta;
    wearOffMedian: { label: string | null; minutes: number | null };
  };
  wearOff: {
    histogram: WearOffBucket[];
    medicatedDays: number;
    daysWithWearOff: number;
    modalBucket: string | null;
    summary: string | null;
  };
  asrsDraft: AsrsDraftItem[];
  sparklines: { sleep: SparklinePoint[]; mood: SparklinePoint[]; appetite: SparklinePoint[] };
  agenda: { text: string; date: string }[];
  redFlags: RedFlagHit[];
  analysis: null; // deferred — overview + recommendation prose slots in here
}

// --- helpers -------------------------------------------------------------

function bucketAsrsAnswer(count: number): AsrsDraftItem["answer"] {
  if (count === 0) return "not observed";
  if (count <= 2) return "Sometimes";
  if (count <= 5) return "Often";
  return "Very Often";
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round1(n: number | null): number | null {
  return n === null ? null : Math.round(n * 10) / 10;
}

function arrowFor(recent: number | null, prior: number | null, epsilon = 0.05): TrendDelta["arrow"] {
  if (recent === null || prior === null) return null;
  const diff = recent - prior;
  if (Math.abs(diff) <= epsilon) return "flat";
  return diff > 0 ? "up" : "down";
}

// --- main ----------------------------------------------------------------

export function computeDigest(patient: PatientRow, allEntries: DigestEntry[]): Digest {
  // Sort ascending by date and keep only the last WINDOW_DAYS.
  const sorted = [...allEntries].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const end = sorted.length ? sorted[sorted.length - 1].entry_date : null;
  const endDate = end ? new Date(end + "T00:00:00Z") : null;

  const inWindow = endDate
    ? sorted.filter((e) => {
        const d = new Date(e.entry_date + "T00:00:00Z");
        const days = (endDate.getTime() - d.getTime()) / 86400000;
        return days >= 0 && days < WINDOW_DAYS;
      })
    : [];

  const daysAgo = (date: string): number => {
    if (!endDate) return 0;
    const d = new Date(date + "T00:00:00Z");
    return Math.round((endDate.getTime() - d.getTime()) / 86400000);
  };

  const recent = inWindow.filter((e) => daysAgo(e.entry_date) < HALF_WINDOW_DAYS);
  const prior = inWindow.filter((e) => daysAgo(e.entry_date) >= HALF_WINDOW_DAYS);

  // --- adherence ---
  const medicated = (es: DigestEntry[]) => es.filter((e) => e.data.med_taken === true).length;
  const journaled = inWindow.length;
  const medicatedDays = medicated(inWindow);
  const adherencePct = journaled ? Math.round((medicatedDays / journaled) * 100) : 0;
  const recentAdh = recent.length ? medicated(recent) / recent.length : null;
  const priorAdh = prior.length ? medicated(prior) / prior.length : null;

  // --- sleep ---
  const sleepVals = (es: DigestEntry[]) =>
    es.map((e) => e.data.sleep_hours).filter((h): h is number => h !== null);
  const recentSleep = round1(avg(sleepVals(recent)));
  const priorSleep = round1(avg(sleepVals(prior)));

  // --- appetite reduced rate ---
  const reducedRate = (es: DigestEntry[]): number | null => {
    const withAppetite = es.filter((e) => e.data.appetite?.status);
    if (!withAppetite.length) return null;
    const reduced = withAppetite.filter((e) => e.data.appetite?.status === "reduced").length;
    return reduced / withAppetite.length;
  };

  // --- wear-off histogram (the money chart, §6) ---
  const wearOffMinutes: number[] = [];
  for (const e of inWindow) {
    if (e.data.med_taken !== true) continue;
    const mins = parseTimeToMinutes(e.data.wear_off_time);
    if (mins !== null) wearOffMinutes.push(mins);
  }
  // 30-minute buckets across the medicated days.
  const bucketMap = new Map<number, number>();
  for (const mins of wearOffMinutes) {
    const bucket = Math.floor(mins / 30) * 30;
    bucketMap.set(bucket, (bucketMap.get(bucket) ?? 0) + 1);
  }
  const histogram: WearOffBucket[] = [...bucketMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, count]) => ({
      label: `${minutesToLabel(bucket)}–${minutesToLabel(bucket + 30)}`,
      count,
    }));
  let modalBucket: string | null = null;
  let modalCount = 0;
  for (const b of histogram) {
    if (b.count > modalCount) {
      modalCount = b.count;
      modalBucket = b.label;
    }
  }
  const sortedWearOff = [...wearOffMinutes].sort((a, b) => a - b);
  const medianMins = sortedWearOff.length
    ? sortedWearOff[Math.floor(sortedWearOff.length / 2)]
    : null;
  const wearOffSummary =
    modalBucket && wearOffMinutes.length
      ? `Wears off around ${modalBucket} on ${modalCount} of ${medicatedDays} medicated days`
      : null;

  // --- ASRS-18 draft ---
  const signalsByConstruct = new Map<string, { date: string; evidence: string }[]>();
  for (const e of inWindow) {
    for (const sig of e.data.asrs_signals) {
      const list = signalsByConstruct.get(sig.construct) ?? [];
      list.push({ date: e.entry_date, evidence: sig.evidence });
      signalsByConstruct.set(sig.construct, list);
    }
  }
  const asrsDraft: AsrsDraftItem[] = ASRS_CONSTRUCTS.map((c) => {
    const snippets = signalsByConstruct.get(c.construct) ?? [];
    const count = snippets.length;
    return {
      item: c.item,
      construct: c.construct,
      domain: c.domain,
      description: c.description,
      count,
      answer: bucketAsrsAnswer(count),
      observed: count > 0,
      snippets: snippets.sort((a, b) => a.date.localeCompare(b.date)),
    };
  });

  // --- sparklines (30 days) ---
  const sleep: SparklinePoint[] = inWindow.map((e) => ({ date: e.entry_date, value: e.data.sleep_hours }));
  const mood: SparklinePoint[] = inWindow.map((e) => ({
    date: e.entry_date,
    value: valenceToScore(e.data.mood?.valence ?? null),
  }));
  const appetite: SparklinePoint[] = inWindow.map((e) => ({
    date: e.entry_date,
    value: e.data.appetite?.status === "reduced" ? -1 : e.data.appetite?.status === "increased" ? 1 : e.data.appetite?.status === "normal" ? 0 : null,
  }));

  // --- agenda (aggregated) ---
  const agenda: { text: string; date: string }[] = [];
  for (const e of inWindow) {
    for (const item of e.data.visit_agenda_items) {
      agenda.push({ text: item, date: e.entry_date });
    }
  }

  // --- red flags (separate channel, never summarized away) ---
  const redFlags: RedFlagHit[] = [];
  for (const e of inWindow) {
    for (const rf of e.data.red_flags) {
      redFlags.push({
        type: rf.type,
        evidence: rf.evidence,
        date: e.entry_date,
        daysAgo: daysAgo(e.entry_date),
      });
    }
  }
  redFlags.sort((a, b) => a.daysAgo - b.daysAgo);

  const recentReduced = reducedRate(recent);
  const priorReduced = reducedRate(prior);

  return {
    patient: { id: patient.id, name: patient.name, medication: patient.medication, dose: patient.dose },
    window: {
      days: WINDOW_DAYS,
      start: inWindow.length ? inWindow[0].entry_date : null,
      end,
      journaledDays: journaled,
    },
    headline: {
      adherence: {
        pct: adherencePct,
        medicatedDays,
        journaledDays: journaled,
        recent: recentAdh,
        prior: priorAdh,
        arrow: arrowFor(recentAdh, priorAdh, 0.01),
      },
      avgSleep: { recent: recentSleep, prior: priorSleep, arrow: arrowFor(recentSleep, priorSleep) },
      appetiteReducedRate: {
        recent: recentReduced,
        prior: priorReduced,
        arrow: arrowFor(recentReduced, priorReduced, 0.01),
      },
      wearOffMedian: {
        label: medianMins !== null ? minutesToLabel(medianMins) : null,
        minutes: medianMins,
      },
    },
    wearOff: {
      histogram,
      medicatedDays,
      daysWithWearOff: wearOffMinutes.length,
      modalBucket,
      summary: wearOffSummary,
    },
    asrsDraft,
    sparklines: { sleep, mood, appetite },
    agenda,
    redFlags,
    analysis: null,
  };
}
