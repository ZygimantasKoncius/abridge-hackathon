import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// SQLite, one file, three tables (spec §3). We store the RAW transcript AND the
// extraction JSON — the raw transcript is the audit trail and the source for
// every evidence snippet.

const DB_PATH =
  process.env.ABRIDGE_DB_PATH ?? path.join(process.cwd(), "data", "abridge.db");

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS patients (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  medication  TEXT,
  dose        TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id               TEXT PRIMARY KEY,
  patient_id       TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  transcript       TEXT NOT NULL,
  source           TEXT NOT NULL DEFAULT 'realtime_voice',
  duration_seconds INTEGER,
  entry_date       TEXT NOT NULL,          -- YYYY-MM-DD (the day being journaled)
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_patient_date ON entries(patient_id, entry_date);

CREATE TABLE IF NOT EXISTS extractions (
  id               TEXT PRIMARY KEY,
  entry_id         TEXT NOT NULL UNIQUE REFERENCES entries(id) ON DELETE CASCADE,
  data             TEXT NOT NULL,          -- ExtractionData as JSON
  model            TEXT NOT NULL,
  corrected_fields TEXT NOT NULL DEFAULT '[]', -- JSON array of field paths corrected via receipt chips
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- Cached LLM analysis block, one row per patient. Regenerated only when the
-- underlying data changes (tracked by the signature column), so provider views
-- serve a cached copy instantly instead of re-paying the ~5-15s Opus call.
CREATE TABLE IF NOT EXISTS analyses (
  patient_id  TEXT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  data        TEXT NOT NULL,
  signature   TEXT NOT NULL,
  model       TEXT NOT NULL,
  computed_at TEXT NOT NULL
);
`;

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  _db = db;
  return db;
}

// --- Row types -----------------------------------------------------------

export interface PatientRow {
  id: string;
  name: string;
  medication: string | null;
  dose: string | null;
  created_at: string;
}

export interface EntryRow {
  id: string;
  patient_id: string;
  transcript: string;
  source: string;
  duration_seconds: number | null;
  entry_date: string;
  created_at: string;
}

export interface ExtractionRow {
  id: string;
  entry_id: string;
  data: string;
  model: string;
  corrected_fields: string;
  created_at: string;
  updated_at: string;
}
