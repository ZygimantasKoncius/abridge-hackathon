import type {
  AppetiteStatus,
  AsrsSignal,
  Entry,
  Extraction,
  FunctionalMention,
  MoodValence,
  Patient,
  RedFlag,
  SideEffect,
  SleepQuality,
} from "./types";
import { ASRS_BY_ITEM } from "./asrs";

// ---------------------------------------------------------------------------
// Seed data. Generated deterministically so the digest math produces the exact
// clinical story from §7: Patient A develops a ~2:30pm wear-off pattern with a
// concurrent sleep decline and rising losing-things mentions; Patient B is
// mostly stable with one diversion-adjacent red flag.
//
// In production these rows come from the real Claude extraction pass over voice
// transcripts. The shape is identical, so the UI never knows the difference.
// ---------------------------------------------------------------------------

function sleepQuality(h: number): SleepQuality {
  if (h >= 6.5) return "good";
  if (h >= 5.5) return "fair";
  return "poor";
}

function asrs(item: number, evidence: string): AsrsSignal {
  const def = ASRS_BY_ITEM[item];
  return { item, construct: def.construct, evidence };
}

/** Build a short synthetic transcript from an extraction (audit-trail stand-in). */
function synthTranscript(x: Extraction, name: string): string {
  const parts: string[] = [`Hey — how'd today go?`, `— `];
  const bits: string[] = [];
  if (x.med_taken === false) bits.push("Honestly I forgot my meds this morning, didn't realize until lunch.");
  else if (x.med_time) bits.push(`Took my meds around ${x.med_time}.`);
  if (x.wear_off_time) bits.push(`Felt them wear off around ${x.wear_off_time}${x.crash_reported ? " and kind of crashed after that" : ""}.`);
  if (x.mood) bits.push(x.mood.evidence + ".");
  x.asrs_signals.forEach((s) => bits.push(s.evidence + "."));
  x.side_effects.forEach((s) => bits.push(s.evidence + "."));
  if (x.appetite && x.appetite.status !== "normal") bits.push(x.appetite.evidence + ".");
  if (x.red_flags.length) bits.push(x.red_flags[0].evidence + ".");
  parts.push(bits.join(" "));
  parts.push(
    x.sleep_hours != null
      ? `Agent: Quick one before we wrap — how'd you sleep? — About ${x.sleep_hours} hours, ${x.sleep_quality}.`
      : "",
  );
  return parts.filter(Boolean).join("\n");
}

// --- Patient A: the main demo -------------------------------------------------

const A_DATES = [
  // week 1
  "2026-06-20", "2026-06-21", "2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26",
  // week 2  (06-28 skipped — a missed day is data, not a failure)
  "2026-06-27", "2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02", "2026-07-03",
  // week 3  (07-06 skipped)
  "2026-07-04", "2026-07-05", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10",
  // week 4
  "2026-07-11", "2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17",
];

const A_SLEEP: Record<string, number> = {
  "2026-06-20": 7, "2026-06-21": 7.5, "2026-06-22": 6.5, "2026-06-23": 7, "2026-06-24": 7, "2026-06-25": 6.5, "2026-06-26": 7,
  "2026-06-27": 7, "2026-06-29": 6.5, "2026-06-30": 7, "2026-07-01": 7, "2026-07-02": 6.5, "2026-07-03": 6.5,
  "2026-07-04": 6.5, "2026-07-05": 6, "2026-07-07": 6, "2026-07-08": 5.5, "2026-07-09": 6, "2026-07-10": 5.5,
  "2026-07-11": 5.5, "2026-07-12": 5, "2026-07-13": 5.5, "2026-07-14": 5, "2026-07-15": 5.5, "2026-07-16": 5, "2026-07-17": 5.5,
};

// med_taken=false on these days (forgot). Everything else medicated.
const A_MISSED_MEDS = new Set(["2026-06-24", "2026-07-01", "2026-07-08", "2026-07-15"]);

// wear-off reported (parsed time). Clusters ~2:30pm in weeks 3–4, milder late wk2.
const A_WEAROFF: Record<string, string> = {
  "2026-06-30": "3:45pm", "2026-07-02": "3:30pm",
  "2026-07-04": "2:30pm", "2026-07-05": "2:15pm", "2026-07-07": "2:45pm",
  "2026-07-09": "2:30pm", "2026-07-10": "2:00pm",
  "2026-07-11": "2:30pm", "2026-07-12": "2:45pm", "2026-07-13": "2:15pm",
  "2026-07-14": "3:00pm", "2026-07-16": "2:30pm", "2026-07-17": "2:30pm",
};

// losing-things (item 7) — six dated snippets for the demo click.
const A_LOSING: Record<string, string> = {
  "2026-07-04": "couldn't find my keys this morning, tore the whole apartment apart",
  "2026-07-07": "left my badge at home again, second time this week",
  "2026-07-09": "spent ten minutes looking for my phone, it was basically in my hand",
  "2026-07-11": "misplaced the report I printed, had to reprint it before standup",
  "2026-07-14": "lost my wallet for an hour, made me late leaving the house",
  "2026-07-16": "put my coffee down somewhere and found it in the bathroom later",
};

// finishing-tasks (item 1) — the afternoon-collapse pattern.
const A_FINISHING: Record<string, string> = {
  "2026-07-05": "left the deck ninety percent done again, couldn't push it over the line",
  "2026-07-10": "started three things this afternoon and finished none of them",
  "2026-07-13": "the afternoon just falls apart, nothing gets closed out",
  "2026-07-16": "another report stuck at the last step, ran out of gas by three",
};

function buildPatientA(): Entry[] {
  return A_DATES.map((date, i): Entry => {
    const medTaken = !A_MISSED_MEDS.has(date);
    const sleep = A_SLEEP[date];
    const wearOff = medTaken ? (A_WEAROFF[date] ?? null) : null;
    const crash = wearOff != null && date >= "2026-07-04";
    const isLate = date >= "2026-07-04";

    const appetiteStatus: AppetiteStatus = medTaken && i % 2 === 0 ? "reduced" : "normal";
    const mood: { valence: MoodValence; evidence: string } = isLate && crash
      ? { valence: "irritable", evidence: "snapped at a coworker over nothing after lunch" }
      : isLate
        ? { valence: "flat", evidence: "felt kind of flat and low-energy by the afternoon" }
        : i % 3 === 0
          ? { valence: "positive", evidence: "good day, felt on top of things" }
          : { valence: "neutral", evidence: "pretty normal day overall" };

    const signals: AsrsSignal[] = [];
    if (A_LOSING[date]) signals.push(asrs(7, A_LOSING[date]));
    if (A_FINISHING[date]) signals.push(asrs(1, A_FINISHING[date]));
    // baseline low-grade signals through the month
    if (i % 5 === 0) signals.push(asrs(11, "kept getting pulled off task by Slack pings"));
    if (i % 7 === 3) signals.push(asrs(13, "couldn't sit still in the afternoon meeting"));
    if (isLate && i % 4 === 0) signals.push(asrs(8, "zoned out on the review doc, read the same line five times"));

    const functional: FunctionalMention[] = [];
    if (crash) functional.push({ domain: "work", valence: "negative", evidence: "missed half of the standup, brain fog by three" });

    const sideEffects: SideEffect[] = [];
    if (isLate && i % 3 === 0) sideEffects.push({ type: "headache", evidence: "dull headache all afternoon" });
    if (appetiteStatus === "reduced" && i % 4 === 1) sideEffects.push({ type: "appetite_loss", evidence: "no appetite until dinner" });

    const agenda: string[] = crash ? ["wants to ask about the afternoon crash"] : [];

    const extraction: Extraction = {
      med_taken: medTaken,
      med_time: medTaken ? "8:15am" : null,
      wear_off_time: wearOff,
      crash_reported: crash,
      sleep_hours: sleep,
      sleep_quality: sleepQuality(sleep),
      appetite:
        appetiteStatus === "reduced"
          ? { status: "reduced", evidence: "skipped lunch again, forgot to eat" }
          : { status: "normal", evidence: "ate normally" },
      mood,
      caffeine_alcohol_cannabis:
        i % 3 === 0 ? { mentioned: true, detail: "3 coffees to push through the afternoon" } : null,
      asrs_signals: signals,
      functional_mentions: functional,
      side_effects: sideEffects,
      red_flags: [],
      visit_agenda_items: agenda,
    };

    return {
      id: `a-${date}`,
      patient_id: "patient-a",
      date,
      source: i % 6 === 0 ? "simple" : "realtime_voice",
      transcript: synthTranscript(extraction, "Maya"),
      extraction,
    };
  });
}

// --- Patient B: the red-flag demo --------------------------------------------

const B_DATES = [
  "2026-06-24", "2026-06-25", "2026-06-26", "2026-06-27", "2026-06-29", "2026-06-30",
  "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-05", "2026-07-06", "2026-07-08",
  "2026-07-09", "2026-07-10", "2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15",
  "2026-07-16", "2026-07-17",
];

function buildPatientB(): Entry[] {
  return B_DATES.map((date, i): Entry => {
    const medTaken = date !== "2026-07-06"; // one forgotten day
    const sleep = 6.5 + (i % 3 === 0 ? 0.5 : 0);
    const isFlag = date === "2026-07-13"; // diversion-adjacent entry

    const redFlags: RedFlag[] = isFlag
      ? [{ type: "diversion_signal", evidence: "I ran out a few days early so I've been stretching the last couple pills to make it to the appointment" }]
      : [];

    const signals: AsrsSignal[] = [];
    if (i % 4 === 0) signals.push(asrs(2, "desk was a disaster, couldn't find anything to start the day"));
    if (i % 6 === 2) signals.push(asrs(17, "hate waiting in line, nearly left the pharmacy"));

    const extraction: Extraction = {
      med_taken: medTaken,
      med_time: medTaken ? "7:45am" : null,
      wear_off_time: medTaken && i % 5 === 0 ? "5:30pm" : null,
      crash_reported: false,
      sleep_hours: sleep,
      sleep_quality: sleepQuality(sleep),
      appetite: { status: "normal", evidence: "appetite's been fine" },
      mood:
        isFlag
          ? { valence: "anxious", evidence: "stressed about running low before the visit" }
          : i % 2 === 0
            ? { valence: "positive", evidence: "solid, productive day" }
            : { valence: "neutral", evidence: "steady day, nothing off" },
      caffeine_alcohol_cannabis: null,
      asrs_signals: signals,
      functional_mentions:
        i % 3 === 0 ? [{ domain: "work", valence: "positive", evidence: "cleared the backlog before lunch" }] : [],
      side_effects: [],
      red_flags: redFlags,
      visit_agenda_items: isFlag ? ["wants to talk about timing of the refill"] : [],
    };

    return {
      id: `b-${date}`,
      patient_id: "patient-b",
      date,
      source: "realtime_voice",
      transcript: synthTranscript(extraction, "Devon"),
      extraction,
    };
  });
}

export const PATIENTS: Patient[] = [
  {
    id: "patient-a",
    name: "Maya Okafor",
    age: 29,
    medication: "Adderall IR 20mg — one dose AM",
    entries: buildPatientA(),
  },
  {
    id: "patient-b",
    name: "Devon Rivera",
    age: 34,
    medication: "Vyvanse 40mg — one dose AM",
    entries: buildPatientB(),
  },
];

export function getPatient(id: string): Patient | undefined {
  return PATIENTS.find((p) => p.id === id);
}
