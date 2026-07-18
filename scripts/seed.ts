/**
 * Seed generator (spec §7).
 *
 * Generates ~28 days of synthetic, natural-language check-in transcripts for two
 * patients and runs every one through the REAL Claude extraction pipeline — this
 * proves the pipeline at n≈28 and produces real-shaped data for the dashboard.
 *
 *   Patient A (Alex, main demo): weeks 1–2 stable; weeks 3–4 develop a consistent
 *     ~2:30pm wear-off + sleep degrading 7h → ~5h + losing-things mentions.
 *     The digest should visibly tell the "consider XR / afternoon booster" story.
 *   Patient B (Sam, red-flag demo): mostly stable, one entry with an
 *     early-refill / diversion-adjacent phrase → banner demo.
 *
 * Run:  npm run seed
 * Needs ANTHROPIC_API_KEY (or an `ant auth login` profile).
 */

import { ANALYSIS_MODEL, analyzeDigest } from "../src/lib/analysis";
import { getDb } from "../src/lib/db";
import { computeDigest } from "../src/lib/server-digest";
import { extractEntry } from "../src/lib/extraction";
import {
  getPatient,
  getPatientDataSignature,
  insertEntryWithExtraction,
  loadDigestEntries,
  saveAnalysis,
  upsertPatient,
} from "../src/lib/queries";

const DAYS = 28;
const CONCURRENCY = 5;

// --- tiny seeded RNG for reproducible transcripts ------------------------
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number): boolean => rand() < p;

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function timeLabel(hour: number, minute: number): string {
  const mer = hour >= 12 ? "pm" : "am";
  let h12 = hour % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${minute.toString().padStart(2, "0")}${mer}`;
}

const AGENT_OPENERS = [
  "Hey — how'd today go?",
  "Hi, how was your day?",
  "How are you doing today?",
];

function wrap(narrative: string): string {
  return `Agent: ${pick(AGENT_OPENERS)}\nPatient: ${narrative}`;
}

// --- Patient A (Alex) ----------------------------------------------------

const ALEX_SKIP_DAYS = new Set([9, 22]); // indices where meds are skipped

function alexTranscript(i: number): string {
  const declining = i >= 14;
  const parts: string[] = [];

  if (ALEX_SKIP_DAYS.has(i)) {
    parts.push(pick([
      "I forgot to take my meds today, just never got around to it.",
      "Didn't take my medication this morning — ran out the door and blanked on it.",
    ]));
  } else {
    const medTime = timeLabel(8, Math.floor(rand() * 30));
    parts.push(`I took my meds around ${medTime} this morning.`);

    if (!declining) {
      const wo = timeLabel(16, 15 + Math.floor(rand() * 60)); // ~4:15–5:15pm
      parts.push(pick([
        `They lasted most of the day, felt like they wore off around ${wo}.`,
        `Coverage was good, didn't really notice them fading until about ${wo}.`,
      ]));
    } else {
      const wo = timeLabel(14, Math.floor(rand() * 45)); // ~2:00–2:45pm
      parts.push(pick([
        `They wore off way earlier than usual, around ${wo}, and I crashed hard in the afternoon.`,
        `By about ${wo} I could feel them gone — hit a total wall and couldn't focus.`,
        `The meds faded around ${wo} again and I got really foggy and tired after.`,
      ]));
    }
  }

  // sleep
  let sleep: number;
  if (!declining) {
    sleep = Math.round((7 + (rand() - 0.5)) * 2) / 2; // ~6.5–7.5
    parts.push(`I slept about ${sleep} hours and felt rested.`);
  } else {
    sleep = Math.round((6.5 - ((i - 14) / 13) * 1.5 + (rand() - 0.5) * 0.5) * 2) / 2;
    parts.push(`I only got around ${sleep} hours of sleep, and it was pretty restless.`);
  }

  // appetite
  if (declining && chance(0.7)) {
    parts.push(pick([
      "I skipped lunch again, wasn't hungry at all.",
      "My appetite's been low — barely ate until dinner.",
      "Forgot to eat lunch, just no appetite lately.",
    ]));
  } else if (chance(0.2)) {
    parts.push("Ate pretty normally today.");
  }

  // mood
  if (!declining) {
    parts.push(pick([
      "Mood was fine, felt pretty calm.",
      "Overall a decent, steady day.",
      "Felt okay, nothing really off.",
    ]));
  } else {
    parts.push(pick([
      "I was really irritable in the afternoon and snapped at a coworker.",
      "Felt frustrated and kind of low most of the day.",
      "Pretty on-edge and cranky once the meds wore off.",
    ]));
  }

  // losing things (ASRS losing_things, item 7)
  if (declining && i % 2 === 0) {
    parts.push(pick([
      "Couldn't find my keys this morning, spent ten minutes looking.",
      "Misplaced my phone again and tore the house apart looking for it.",
      "Lost track of my wallet — no idea where I left it.",
    ]));
  }

  // work / functional
  if (declining && chance(0.4)) {
    parts.push(pick([
      "I missed the standup because I lost track of time.",
      "I'm way behind on emails and blanked on a deadline.",
      "Couldn't get through my to-do list, kept getting distracted.",
    ]));
  }

  // caffeine
  if (chance(0.35)) {
    const n = pick(["two", "three"]);
    parts.push(`Had ${n} coffees to push through the afternoon.`);
  }

  // agenda
  if (declining && chance(0.35)) {
    parts.push("I really want to ask my doctor about this afternoon crash.");
  }

  return wrap(parts.join(" "));
}

// --- Patient B (Sam) -----------------------------------------------------

const SAM_DIVERSION_DAY = 20;

function samTranscript(i: number): string {
  if (i === SAM_DIVERSION_DAY) {
    return wrap(
      "Honestly I ran out a few days early this month — work got crazy and I ended up taking a couple extra last week to keep up, so I've been off it for two days now. Sleep's been okay, maybe seven hours. Mood's fine, just annoyed I miscounted.",
    );
  }

  const parts: string[] = [];
  const medTime = timeLabel(8, 30 + Math.floor(rand() * 30));
  parts.push(`Took my meds around ${medTime}.`);
  const wo = timeLabel(16, 45 + Math.floor(rand() * 45)); // ~4:45–5:30pm
  parts.push(`They carried me through the day, wore off around ${wo}.`);
  const sleep = Math.round((7 + (rand() - 0.5)) * 2) / 2;
  parts.push(`Slept about ${sleep} hours.`);
  parts.push(pick([
    "Mood was good, productive day overall.",
    "Felt steady and focused.",
    "Pretty solid day, nothing off.",
  ]));
  if (chance(0.25)) {
    parts.push(pick([
      "Got a little distracted by noise in the office but nothing major.",
      "Ate normally, appetite was fine.",
      "Had a coffee in the morning, that's it.",
    ]));
  }
  return wrap(parts.join(" "));
}

// --- runner --------------------------------------------------------------

interface Job {
  patient_id: string;
  transcript: string;
  entry_date: string;
}

async function runPool(jobs: Job[]) {
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const extraction = await extractEntry(job.transcript);
      insertEntryWithExtraction(
        {
          patient_id: job.patient_id,
          transcript: job.transcript,
          source: "seed_synthetic",
          entry_date: job.entry_date,
        },
        extraction,
      );
      done++;
      const flags = extraction.data.red_flags.length ? ` [red_flag: ${extraction.data.red_flags.map((r) => r.type).join(",")}]` : "";
      console.log(`  ✓ ${done}/${jobs.length}  ${job.entry_date}${flags}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

async function main() {
  console.log("Seeding patients…");
  const alex = upsertPatient({ id: "patient-a", name: "Alex Rivera", medication: "Adderall XR", dose: "20 mg" });
  const sam = upsertPatient({ id: "patient-b", name: "Sam Chen", medication: "Vyvanse", dose: "40 mg" });

  // Clear prior seed entries so re-runs don't duplicate (cascade drops extractions).
  const db = getDb();
  db.prepare("DELETE FROM entries WHERE patient_id IN (?, ?)").run(alex.id, sam.id);

  const jobs: Job[] = [];
  for (let i = 0; i < DAYS; i++) {
    const date = isoDate(DAYS - 1 - i);
    jobs.push({ patient_id: alex.id, transcript: alexTranscript(i), entry_date: date });
    jobs.push({ patient_id: sam.id, transcript: samTranscript(i), entry_date: date });
  }

  console.log(`Extracting ${jobs.length} entries through the real pipeline (Opus 4.8, concurrency ${CONCURRENCY})…`);
  const t0 = Date.now();
  await runPool(jobs);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);

  // Warm the analysis cache so the provider digest loads instantly on stage.
  console.log("\nWarming analysis cache…");
  for (const id of [alex.id, sam.id]) {
    const p = getPatient(id)!;
    const digest = computeDigest(p, loadDigestEntries(id));
    const result = await analyzeDigest(digest);
    saveAnalysis(id, result, getPatientDataSignature(id), ANALYSIS_MODEL);
    console.log(`  ✓ ${p.name}: ${result.recommendation_option} — ${result.overview}`);
  }

  console.log(`\nPatient A: ${alex.id}  (main demo — wear-off/sleep story)`);
  console.log(`Patient B: ${sam.id}  (red-flag demo)`);
  console.log(`\nTry:  curl localhost:3000/api/digest/${alex.id} | jq`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
