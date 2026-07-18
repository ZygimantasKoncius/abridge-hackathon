import Anthropic from "@anthropic-ai/sdk";
import { AnalysisResult, Digest, RECOMMENDATION_OPTIONS } from "./digest";

// The provider-view analysis block (spec §6): a 2-sentence overview + a one-line
// recommendation phrased as a discussion prompt from a BOUNDED option set.
//
// Stats in, prose out — the model never invents numbers. All figures come from
// the computed digest; the model only phrases and cites. Red flags are NEVER
// passed in or referenced here — they live in their own banner channel.
//
// One analysis call per digest render (§3).

const MODEL = process.env.ANALYSIS_MODEL ?? "claude-opus-4-8";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const SYSTEM_PROMPT = `You write the provider-facing analysis block for an ADHD monthly-visit prep tool.

You receive PRE-COMPUTED statistics from a patient's 30-day daily check-in digest. Your job is to phrase — not to compute, and not to decide.

HARD RULES
- Use ONLY the numbers provided. Never invent, estimate, or extrapolate a statistic. If a figure isn't in the input, don't state it.
- This is decision SUPPORT, not decision making. Always phrase recommendations as "Consider discussing X" — NEVER "prescribe", "increase", "start", "switch to", or any directive to change medication.
- You never see or mention safety red flags; those are handled in a separate channel.
- Every recommendation must cite the specific stat that motivates it, inline.

OVERVIEW
- At most 2 sentences. Surface something ONLY if it genuinely stands out (a real trend, a consistent pattern, a meaningful change between the recent and prior halves of the window).
- Silence is a feature. If nothing is notable, set notable=false and output exactly: "No significant changes since last visit." and choose recommendation_option "continue_current_regimen".

RECOMMENDATION (bounded option set — choose exactly one)
- formulation_coverage_change: coverage gap / consistent early wear-off (discuss IR<->XR or an afternoon booster).
- dose_timing_shift: timing mismatch between dosing and when coverage is needed.
- sleep_conversation: a sleep decline or poor-sleep pattern (hygiene first; sleep-aid discussion only if it persists).
- confounder_workup: a pattern better explained by sleep, substances, thyroid, or stress before any med change.
- side_effect_management: a recurring side effect worth addressing.
- continue_current_regimen: nothing notable, or stable and well-controlled.
- Phrase as one line, a discussion prompt, with the supporting stat inline. If the sleep trend should be addressed before any dose change, say so.

Output must conform exactly to the provided schema.`;

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    notable: { type: "boolean" },
    overview: { type: "string" },
    recommendation: { type: "string" },
    recommendation_option: { type: "string", enum: [...RECOMMENDATION_OPTIONS] },
    supporting_stat: { type: ["string", "null"] },
  },
  required: ["notable", "overview", "recommendation", "recommendation_option", "supporting_stat"],
} as const;

// Compact, red-flag-free view of the computed stats handed to the model.
function buildAnalysisInput(digest: Digest) {
  return {
    medication: digest.patient.medication,
    dose: digest.patient.dose,
    window_days: digest.window.days,
    journaled_days: digest.window.journaledDays,
    adherence: {
      pct: digest.headline.adherence.pct,
      medicated_days: digest.headline.adherence.medicatedDays,
      recent_rate: digest.headline.adherence.recent,
      prior_rate: digest.headline.adherence.prior,
      trend: digest.headline.adherence.arrow,
    },
    sleep_hours: {
      recent_avg: digest.headline.avgSleep.recent,
      prior_avg: digest.headline.avgSleep.prior,
      trend: digest.headline.avgSleep.arrow,
    },
    appetite_reduced_rate: {
      recent: digest.headline.appetiteReducedRate.recent,
      prior: digest.headline.appetiteReducedRate.prior,
      trend: digest.headline.appetiteReducedRate.arrow,
    },
    wear_off: {
      summary: digest.wearOff.summary,
      modal_bucket: digest.wearOff.modalBucket,
      days_with_wear_off: digest.wearOff.daysWithWearOff,
      medicated_days: digest.wearOff.medicatedDays,
      median: digest.headline.wearOffMedian.label,
    },
    asrs_observed: digest.asrsDraft
      .filter((a) => a.observed)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map((a) => ({ construct: a.construct, domain: a.domain, count: a.count, answer: a.answer })),
    agenda: [...new Set(digest.agenda.map((a) => a.text))],
  };
}

export async function analyzeDigest(digest: Digest): Promise<AnalysisResult> {
  const input = buildAnalysisInput(digest);

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    output_config: {
      format: { type: "json_schema", schema: ANALYSIS_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Computed digest statistics (JSON). Write the analysis block.\n\n${JSON.stringify(input, null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`analysis: no text block (stop_reason=${response.stop_reason})`);
  }
  return JSON.parse(textBlock.text) as AnalysisResult;
}
