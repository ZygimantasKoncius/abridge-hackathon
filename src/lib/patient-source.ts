// Server-side data source: turns the SQLite tables into the exact `Patient`
// shape the provider UI already consumes (types.ts), so the dashboard is a
// data-source swap over the mock, not a UI change. Also maps the cached LLM
// analysis (server AnalysisResult) into the UI's Analysis shape.
//
// Node runtime only (pulls in better-sqlite3 via db/queries).

import type { Analysis } from "./digest";
import { getDb } from "./db";
import { getPatient, getStoredAnalysis, listPatients } from "./queries";
import { ExtractionData } from "./schema";
import type { AnalysisResult } from "./server-digest";
import type {
  AppetiteStatus,
  Entry,
  Extraction,
  FunctionalMention,
  MoodValence,
  Patient,
  SleepQuality,
  Valence,
} from "./types";

// Synthetic patients — age is cosmetic header data not stored in the DB.
const AGE_BY_ID: Record<string, number> = { "patient-a": 29, "patient-b": 34 };

function toExtraction(d: ExtractionData): Extraction {
  return {
    med_taken: d.med_taken,
    med_time: d.med_time,
    wear_off_time: d.wear_off_time,
    crash_reported: d.crash_reported ?? false,
    sleep_hours: d.sleep_hours,
    sleep_quality: d.sleep_quality as SleepQuality | null,
    appetite:
      d.appetite && d.appetite.status
        ? { status: d.appetite.status as AppetiteStatus, evidence: d.appetite.evidence ?? "" }
        : null,
    mood:
      d.mood && d.mood.valence
        ? { valence: d.mood.valence as MoodValence, evidence: d.mood.evidence ?? "" }
        : null,
    caffeine_alcohol_cannabis: d.caffeine_alcohol_cannabis
      ? {
          mentioned: d.caffeine_alcohol_cannabis.mentioned,
          detail: d.caffeine_alcohol_cannabis.detail ?? "",
        }
      : null,
    asrs_signals: d.asrs_signals,
    functional_mentions: d.functional_mentions.map((f) => ({
      domain: f.domain as FunctionalMention["domain"],
      valence: f.valence as Valence,
      evidence: f.evidence,
    })),
    side_effects: d.side_effects,
    red_flags: d.red_flags,
    visit_agenda_items: d.visit_agenda_items,
  };
}

interface RawEntryRow {
  id: string;
  patient_id: string;
  entry_date: string;
  source: string;
  transcript: string;
  data: string;
}

function loadEntries(patientId: string): Entry[] {
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.patient_id, e.entry_date, e.source, e.transcript, x.data
       FROM entries e JOIN extractions x ON x.entry_id = e.id
       WHERE e.patient_id = ?
       ORDER BY e.entry_date ASC`,
    )
    .all(patientId) as RawEntryRow[];

  return rows.map((r) => ({
    id: r.id,
    patient_id: r.patient_id,
    date: r.entry_date,
    source: r.source === "simple" ? "simple" : "realtime_voice",
    transcript: r.transcript,
    extraction: toExtraction(JSON.parse(r.data) as ExtractionData),
  }));
}

export function getPatientWithEntries(id: string): Patient | undefined {
  const p = getPatient(id);
  if (!p) return undefined;
  return {
    id: p.id,
    name: p.name,
    age: AGE_BY_ID[p.id] ?? 30,
    medication: [p.medication, p.dose].filter(Boolean).join(" "),
    entries: loadEntries(p.id),
  };
}

export function allPatients(): Patient[] {
  return listPatients()
    .map((p) => getPatientWithEntries(p.id))
    .filter((p): p is Patient => p !== undefined);
}

// Cached LLM analysis (server AnalysisResult) -> the UI's Analysis shape.
// When nothing is notable, overview is null so the UI renders its quiet line.
export function getViewAnalysis(id: string): Analysis | null {
  const stored = getStoredAnalysis(id);
  if (!stored) return null;
  const a = JSON.parse(stored.data) as AnalysisResult;
  return {
    overview: a.notable ? a.overview : null,
    recommendation:
      a.notable && a.recommendation && a.recommendation_option !== "continue_current_regimen"
        ? { text: a.recommendation, stat: a.supporting_stat ?? "" }
        : null,
  };
}
