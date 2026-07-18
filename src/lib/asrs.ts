// The 18 DSM-5-TR ADHD symptom constructs (ASRS-18). item → 1:1 construct.
// 9 inattention, 9 hyperactivity/impulsivity. Item 7 is losing-things to match
// the demo script (§10: "click ASRS item 7 → six timestamped snippets").

export type AsrsDomain = "inattention" | "hyperactivity";

export interface AsrsItemDef {
  item: number;
  construct: string;
  domain: AsrsDomain;
  label: string;
  plain: string; // plain-language description shipped in the extraction prompt
}

export const ASRS_ITEMS: AsrsItemDef[] = [
  { item: 1, construct: "finishing_tasks", domain: "inattention", label: "Wrapping up details", plain: "Trouble finishing the last stretch of a project" },
  { item: 2, construct: "organization", domain: "inattention", label: "Getting organized", plain: "Difficulty putting tasks and materials in order" },
  { item: 3, construct: "remembering", domain: "inattention", label: "Remembering obligations", plain: "Forgets appointments or commitments" },
  { item: 4, construct: "avoidance", domain: "inattention", label: "Avoiding effortful tasks", plain: "Puts off tasks that need sustained thought" },
  { item: 5, construct: "fidgeting", domain: "hyperactivity", label: "Fidgeting", plain: "Fidgets or squirms when seated a while" },
  { item: 6, construct: "driven", domain: "hyperactivity", label: "Driven by a motor", plain: "Feels compelled to keep moving or doing" },
  { item: 7, construct: "losing_things", domain: "inattention", label: "Losing things", plain: "Misplaces or can't find everyday items" },
  { item: 8, construct: "sustaining_attention", domain: "inattention", label: "Sustaining attention", plain: "Loses focus on boring or repetitive work" },
  { item: 9, construct: "careless_mistakes", domain: "inattention", label: "Careless mistakes", plain: "Avoidable errors on tedious work" },
  { item: 10, construct: "listening", domain: "inattention", label: "Following conversation", plain: "Mind wanders when spoken to directly" },
  { item: 11, construct: "distractibility", domain: "inattention", label: "External distraction", plain: "Pulled off task by noise or activity" },
  { item: 12, construct: "leaving_seat", domain: "hyperactivity", label: "Staying seated", plain: "Gets up when expected to stay put" },
  { item: 13, construct: "restlessness", domain: "hyperactivity", label: "Restlessness", plain: "Feels restless or on edge" },
  { item: 14, construct: "unwinding", domain: "hyperactivity", label: "Unwinding", plain: "Can't relax during downtime" },
  { item: 15, construct: "talking", domain: "hyperactivity", label: "Talking too much", plain: "Talks excessively in social settings" },
  { item: 16, construct: "finishing_sentences", domain: "hyperactivity", label: "Finishing sentences", plain: "Completes others' sentences" },
  { item: 17, construct: "waiting_turn", domain: "hyperactivity", label: "Waiting turn", plain: "Struggles to wait for a turn" },
  { item: 18, construct: "interrupting", domain: "hyperactivity", label: "Interrupting", plain: "Interrupts or intrudes on others" },
];

export const ASRS_BY_ITEM: Record<number, AsrsItemDef> = Object.fromEntries(
  ASRS_ITEMS.map((d) => [d.item, d]),
);

export type AsrsFrequency = "Not observed" | "Sometimes" | "Often" | "Very Often";

// §6 bucketing: 0 → not observed; 1–2 → Sometimes; 3–5 → Often; 6+ → Very Often.
export function bucketFrequency(count: number): AsrsFrequency {
  if (count <= 0) return "Not observed";
  if (count <= 2) return "Sometimes";
  if (count <= 5) return "Often";
  return "Very Often";
}

export const RED_FLAG_LABELS: Record<string, string> = {
  suicidality_language: "Suicidality language",
  diversion_signal: "Diversion signal",
  cardiac: "Cardiac symptom",
  psychosis_mania: "Psychosis / mania",
  substance_escalation: "Substance escalation",
};
