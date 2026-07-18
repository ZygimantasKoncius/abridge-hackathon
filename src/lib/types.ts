// Types mirror the §4 extraction schema exactly. The provider UI reads only
// these shapes, so swapping mock data for the real /api/digest/[pid] response
// is a data-source change, not a UI change.

export type SleepQuality = "good" | "fair" | "poor";
export type AppetiteStatus = "normal" | "reduced" | "increased";
export type MoodValence =
  | "positive"
  | "neutral"
  | "irritable"
  | "flat"
  | "anxious";
export type Valence = "positive" | "neutral" | "negative";

export type RedFlagType =
  | "suicidality_language"
  | "diversion_signal"
  | "cardiac"
  | "psychosis_mania"
  | "substance_escalation";

export interface EvidenceField<T> {
  status?: T;
  value?: T;
  evidence: string;
}

export interface AsrsSignal {
  item: number; // 1..18, maps 1:1 to DSM-5-TR constructs
  construct: string;
  evidence: string;
}

export interface FunctionalMention {
  domain: "work" | "home" | "social" | "self";
  valence: Valence;
  evidence: string;
}

export interface SideEffect {
  type: string;
  evidence: string;
}

export interface RedFlag {
  type: RedFlagType;
  evidence: string;
}

/** One extraction row per journal entry — output of the Claude extraction pass. */
export interface Extraction {
  med_taken: boolean | null;
  med_time: string | null;
  wear_off_time: string | null;
  crash_reported: boolean;
  sleep_hours: number | null;
  sleep_quality: SleepQuality | null;
  appetite: { status: AppetiteStatus; evidence: string } | null;
  mood: { valence: MoodValence; evidence: string } | null;
  caffeine_alcohol_cannabis: { mentioned: boolean; detail: string } | null;
  asrs_signals: AsrsSignal[];
  functional_mentions: FunctionalMention[];
  side_effects: SideEffect[];
  red_flags: RedFlag[];
  visit_agenda_items: string[];
}

/** A journal entry: raw transcript (audit trail) + its extraction. */
export interface Entry {
  id: string;
  patient_id: string;
  date: string; // ISO yyyy-mm-dd
  source: "realtime_voice" | "simple";
  transcript: string;
  extraction: Extraction;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  medication: string; // current regimen, e.g. "Adderall IR 20mg AM"
  entries: Entry[];
}
