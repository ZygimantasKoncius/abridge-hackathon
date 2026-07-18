// ASRS-18 construct list (spec §4). The 18 `asrs_signals.item` values map 1:1 to
// the 18 DSM-5-TR symptom constructs (9 inattention, 9 hyperactivity/impulsivity).
// This list — plus plain-language descriptions — ships inside the extraction
// prompt AND drives the auto-drafted ASRS-18 in the provider digest.
//
// Note: item 7 = losing_things, matching the spec's §4 example
// ({"item": 7, "construct": "losing_things", ...}).

import { RED_FLAG_TYPES } from "./schema";

export interface AsrsConstruct {
  item: number;
  construct: string;
  domain: "inattention" | "hyperactivity_impulsivity";
  description: string;
}

export const ASRS_CONSTRUCTS: AsrsConstruct[] = [
  { item: 1, construct: "finishing_tasks", domain: "inattention", description: "Trouble wrapping up the final details of a project or task." },
  { item: 2, construct: "organization", domain: "inattention", description: "Difficulty getting things in order when a task requires organization." },
  { item: 3, construct: "remembering_obligations", domain: "inattention", description: "Problems remembering appointments, deadlines, or obligations." },
  { item: 4, construct: "task_avoidance", domain: "inattention", description: "Avoiding or delaying starting tasks that require a lot of thought." },
  { item: 5, construct: "careless_mistakes", domain: "inattention", description: "Making careless mistakes on boring or difficult work." },
  { item: 6, construct: "sustained_attention", domain: "inattention", description: "Difficulty keeping attention on repetitive or boring work." },
  { item: 7, construct: "losing_things", domain: "inattention", description: "Misplacing or having difficulty finding things (keys, phone, wallet)." },
  { item: 8, construct: "distractibility", domain: "inattention", description: "Being easily distracted by activity or noise nearby." },
  { item: 9, construct: "attention_conversation", domain: "inattention", description: "Difficulty concentrating on what people say even when spoken to directly." },
  { item: 10, construct: "fidgeting", domain: "hyperactivity_impulsivity", description: "Fidgeting or squirming with hands or feet when sitting for a while." },
  { item: 11, construct: "restlessness", domain: "hyperactivity_impulsivity", description: "Feeling restless or fidgety." },
  { item: 12, construct: "leaving_seat", domain: "hyperactivity_impulsivity", description: "Leaving your seat in situations where staying seated is expected." },
  { item: 13, construct: "difficulty_relaxing", domain: "hyperactivity_impulsivity", description: "Difficulty unwinding or relaxing during free time." },
  { item: 14, construct: "overactivity", domain: "hyperactivity_impulsivity", description: "Feeling overly active or compelled to keep doing things." },
  { item: 15, construct: "talking_excessively", domain: "hyperactivity_impulsivity", description: "Talking too much in social situations." },
  { item: 16, construct: "interrupting", domain: "hyperactivity_impulsivity", description: "Interrupting others or finishing their sentences." },
  { item: 17, construct: "difficulty_waiting", domain: "hyperactivity_impulsivity", description: "Difficulty waiting your turn or being impatient." },
  { item: 18, construct: "blurting", domain: "hyperactivity_impulsivity", description: "Blurting out answers or acting without thinking." },
];

const RED_FLAG_DESCRIPTIONS: Record<(typeof RED_FLAG_TYPES)[number], string> = {
  suicidality_language: "Any expression of self-harm, hopelessness, or wanting to not be alive.",
  diversion_signal: "Signs of misuse or diversion: ran out early, took extra doses, shared or sold medication.",
  cardiac: "Chest pain, heart palpitations, racing heart, or fainting.",
  psychosis_mania: "Racing thoughts beyond baseline, paranoia, or not sleeping combined with elevated/expansive mood.",
  substance_escalation: "Escalating use of alcohol, cannabis, or other substances.",
};

// Builds the static extraction system prompt. Kept deterministic (no dates, no
// per-request content) so it caches cleanly across the 56-entry seed batch.
export function buildExtractionSystemPrompt(): string {
  const constructLines = ASRS_CONSTRUCTS.map(
    (c) => `  item ${c.item} — ${c.construct} (${c.domain}): ${c.description}`,
  ).join("\n");

  const redFlagLines = RED_FLAG_TYPES.map(
    (t) => `  ${t}: ${RED_FLAG_DESCRIPTIONS[t]}`,
  ).join("\n");

  return `You are the clinical extraction engine for an ADHD daily voice check-in product.

You receive the raw transcript of a patient's short daily journal (patient + agent turns) and extract structured signals into the provided schema. You are the single source of truth for the patient's clinical record — the conversation agent never writes structured data.

CORE RULES
- Extract only what the transcript supports. Never infer, assume, or fabricate.
- If something is not mentioned, use null for scalar/object fields and [] for arrays. A follow-up already happened in-session, so absence is meaningful — do not guess.
- Every "evidence" field must be a SHORT verbatim quote from the transcript (the patient's own words where possible).
- Times: capture as the patient stated them (e.g. "8:15am", "around 2:30pm"). Do not normalize or invent precision.
- sleep_hours is numeric hours if stated or clearly implied (e.g. "about six hours" -> 6). sleep_quality is good/fair/poor only if described.
- You never give advice, never comment on medication decisions, and never diagnose.

ASRS-18 SIGNALS
The transcript may contain lived-experience signals that map to the 18 ADHD symptom constructs below. Emit one asrs_signals entry per distinct signal, using the exact item number and construct key. Only emit a signal when the transcript genuinely evidences that construct.
${constructLines}

RED-FLAG TAXONOMY (separate safety channel — never soften or omit)
If the transcript contains any of the following, emit a red_flags entry with a verbatim quote. Be conservative but do not miss true positives.
${redFlagLines}

visit_agenda_items: things the patient explicitly says they want to raise with their provider (e.g. "wants to ask about the afternoon crash").

Output must conform exactly to the provided schema.`;
}
