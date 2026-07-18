// The frozen extraction schema (spec §4). One prompt, one schema, applied to
// every entry. Every extracted field carries an `evidence` snippet quoted from
// the transcript. This JSON Schema is fed to Claude via structured outputs
// (output_config.format) — not "respond in JSON" prompting — so the model's
// output is guaranteed to validate.
//
// Nullable fields use JSON Schema type unions (["string", "null"]). Every key
// is listed in `required` and `additionalProperties` is false, so the model
// always emits the full shape; "not mentioned" is encoded as null / [].

export const RED_FLAG_TYPES = [
  "suicidality_language",
  "diversion_signal",
  "cardiac",
  "psychosis_mania",
  "substance_escalation",
] as const;

export type RedFlagType = (typeof RED_FLAG_TYPES)[number];

export interface ExtractionData {
  med_taken: boolean | null;
  med_time: string | null;
  wear_off_time: string | null;
  crash_reported: boolean | null;
  sleep_hours: number | null;
  sleep_quality: "good" | "fair" | "poor" | null;
  appetite: { status: "normal" | "reduced" | "increased" | null; evidence: string | null } | null;
  mood: { valence: string | null; evidence: string | null } | null;
  caffeine_alcohol_cannabis: { mentioned: boolean; detail: string | null } | null;
  asrs_signals: { item: number; construct: string; evidence: string }[];
  functional_mentions: { domain: string; valence: string; evidence: string }[];
  side_effects: { type: string; evidence: string }[];
  red_flags: { type: RedFlagType; evidence: string }[];
  visit_agenda_items: string[];
}

export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    med_taken: { type: ["boolean", "null"] },
    med_time: { type: ["string", "null"] },
    wear_off_time: { type: ["string", "null"] },
    crash_reported: { type: ["boolean", "null"] },
    sleep_hours: { type: ["number", "null"] },
    sleep_quality: { type: ["string", "null"], enum: ["good", "fair", "poor", null] },
    appetite: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        status: { type: ["string", "null"], enum: ["normal", "reduced", "increased", null] },
        evidence: { type: ["string", "null"] },
      },
      required: ["status", "evidence"],
    },
    mood: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        valence: { type: ["string", "null"] },
        evidence: { type: ["string", "null"] },
      },
      required: ["valence", "evidence"],
    },
    caffeine_alcohol_cannabis: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        mentioned: { type: "boolean" },
        detail: { type: ["string", "null"] },
      },
      required: ["mentioned", "detail"],
    },
    asrs_signals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "integer" },
          construct: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["item", "construct", "evidence"],
      },
    },
    functional_mentions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          domain: { type: "string" },
          valence: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["domain", "valence", "evidence"],
      },
    },
    side_effects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["type", "evidence"],
      },
    },
    red_flags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: [...RED_FLAG_TYPES] },
          evidence: { type: "string" },
        },
        required: ["type", "evidence"],
      },
    },
    visit_agenda_items: { type: "array", items: { type: "string" } },
  },
  required: [
    "med_taken",
    "med_time",
    "wear_off_time",
    "crash_reported",
    "sleep_hours",
    "sleep_quality",
    "appetite",
    "mood",
    "caffeine_alcohol_cannabis",
    "asrs_signals",
    "functional_mentions",
    "side_effects",
    "red_flags",
    "visit_agenda_items",
  ],
} as const;

// The three required fields that trigger an in-session follow-up if null (§4).
export function missingRequiredFields(d: ExtractionData): string[] {
  const missing: string[] = [];
  if (d.med_taken === null) missing.push("med_taken");
  if (d.sleep_hours === null && d.sleep_quality === null) missing.push("sleep");
  if (d.mood === null || d.mood.valence === null) missing.push("mood");
  return missing;
}
