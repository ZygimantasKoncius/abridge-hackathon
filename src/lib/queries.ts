import { randomUUID } from "node:crypto";
import { EntryRow, ExtractionRow, PatientRow, getDb } from "./db";
import type { DigestEntry } from "./server-digest";
import { ExtractionData } from "./schema";

// --- patients ------------------------------------------------------------

export function getPatient(id: string): PatientRow | undefined {
  return getDb().prepare("SELECT * FROM patients WHERE id = ?").get(id) as PatientRow | undefined;
}

export function listPatients(): PatientRow[] {
  return getDb().prepare("SELECT * FROM patients ORDER BY name").all() as PatientRow[];
}

export function upsertPatient(p: {
  id?: string;
  name: string;
  medication?: string | null;
  dose?: string | null;
}): PatientRow {
  const id = p.id ?? randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO patients (id, name, medication, dose, created_at)
       VALUES (@id, @name, @medication, @dose, @created_at)
       ON CONFLICT(id) DO UPDATE SET name=@name, medication=@medication, dose=@dose`,
    )
    .run({ id, name: p.name, medication: p.medication ?? null, dose: p.dose ?? null, created_at: now });
  return getPatient(id)!;
}

// --- entries + extractions ----------------------------------------------

export interface InsertEntryInput {
  patient_id: string;
  transcript: string;
  source?: string;
  duration_seconds?: number | null;
  entry_date?: string; // YYYY-MM-DD; defaults to today (UTC)
}

export function insertEntryWithExtraction(
  input: InsertEntryInput,
  extraction: { data: ExtractionData; model: string },
): { entry: EntryRow; extraction: ExtractionRow } {
  const db = getDb();
  const now = new Date().toISOString();
  const entryId = randomUUID();
  const entry: EntryRow = {
    id: entryId,
    patient_id: input.patient_id,
    transcript: input.transcript,
    source: input.source ?? "realtime_voice",
    duration_seconds: input.duration_seconds ?? null,
    entry_date: input.entry_date ?? now.slice(0, 10),
    created_at: now,
  };
  const extractionId = randomUUID();
  const extractionRow: ExtractionRow = {
    id: extractionId,
    entry_id: entryId,
    data: JSON.stringify(extraction.data),
    model: extraction.model,
    corrected_fields: "[]",
    created_at: now,
    updated_at: now,
  };

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO entries (id, patient_id, transcript, source, duration_seconds, entry_date, created_at)
       VALUES (@id, @patient_id, @transcript, @source, @duration_seconds, @entry_date, @created_at)`,
    ).run(entry);
    db.prepare(
      `INSERT INTO extractions (id, entry_id, data, model, corrected_fields, created_at, updated_at)
       VALUES (@id, @entry_id, @data, @model, @corrected_fields, @created_at, @updated_at)`,
    ).run(extractionRow);
  });
  tx();

  return { entry, extraction: extractionRow };
}

export function getExtractionByEntry(entryId: string): ExtractionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM extractions WHERE entry_id = ?")
    .get(entryId) as ExtractionRow | undefined;
}

export function updateExtractionData(
  entryId: string,
  data: ExtractionData,
  correctedFields: string[],
): ExtractionRow | undefined {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE extractions SET data = @data, corrected_fields = @corrected_fields, updated_at = @updated_at
       WHERE entry_id = @entry_id`,
    )
    .run({
      entry_id: entryId,
      data: JSON.stringify(data),
      corrected_fields: JSON.stringify(correctedFields),
      updated_at: now,
    });
  return getExtractionByEntry(entryId);
}

// Loads every extracted entry for a patient, shaped for the digest computation.
export function loadDigestEntries(patientId: string): DigestEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT e.id AS entry_id, e.entry_date AS entry_date, x.data AS data
       FROM entries e
       JOIN extractions x ON x.entry_id = e.id
       WHERE e.patient_id = ?
       ORDER BY e.entry_date ASC`,
    )
    .all(patientId) as { entry_id: string; entry_date: string; data: string }[];

  return rows.map((r) => ({
    entry_id: r.entry_id,
    entry_date: r.entry_date,
    data: JSON.parse(r.data) as ExtractionData,
  }));
}
