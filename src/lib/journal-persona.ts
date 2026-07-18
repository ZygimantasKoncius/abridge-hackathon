// Patient journal configuration (spec §5 + §5b). The OpenAI Realtime agent owns
// the *conversation* only; it never writes structured data. On session end the
// full patient+agent transcript posts to /api/entries, where the Claude
// extraction pass is the single source of truth. Everything here is the voice
// persona + session wiring — no clinical logic lives on this side of the seam.

// Model from the linked docs (developers.openai.com/api/docs/models/gpt-realtime-2).
// A `gpt-realtime-2.1` also exists; override with OPENAI_REALTIME_MODEL if the
// stage rehearsal wants it. `mini` is not offered for this generation.
export const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2";

// Warm, neutral voice for a 90-second check-in.
export const REALTIME_VOICE = "marin";

// Patient's own words are what the extraction pass cites — capture them, not
// just the agent's audio transcript.
export const INPUT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

// Hard session cap so a rambling demo can't run away (spec §5b).
export const SESSION_HARD_CAP_MS = 3 * 60 * 1000;

// Roster is hardcoded for the hackathon (no auth, spec §3). Ids match the seed
// (scripts/seed.ts) so a real check-in lands in the provider view. The greeting
// name is cosmetic; the POST validates patient_id against the seeded DB.
export interface JournalPatient {
  id: string;
  firstName: string;
}

export const JOURNAL_PATIENTS: Record<string, JournalPatient> = {
  "patient-a": { id: "patient-a", firstName: "Alex" },
  "patient-b": { id: "patient-b", firstName: "Sam" },
};

export const DEFAULT_PATIENT_ID = "patient-a";

export function resolvePatient(idParam?: string): JournalPatient {
  if (idParam && JOURNAL_PATIENTS[idParam]) return JOURNAL_PATIENTS[idParam];
  return JOURNAL_PATIENTS[DEFAULT_PATIENT_ID];
}

// The session-end signal (spec §5b): the agent calls this tool after its verbal
// wrap-up; the client treats the call as "harvest transcript and POST".
export const END_SESSION_TOOL = {
  type: "function",
  name: "end_session",
  description:
    "Call this immediately after you have given your short spoken recap and the " +
    "patient has confirmed or corrected it. Calling it ends the daily check-in. " +
    "Do not call it before you have recapped what you heard.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  },
} as const;

// Session instructions carry the whole persona (spec §5 + §5b). Narrative-first,
// one consolidated probe for missing required fields, spoken recap, then
// end_session. Never clinical, never medical advice; red-flag language is
// acknowledged supportively and routed — detection happens in the backend
// extraction pass, never in the conversation.
export function buildJournalInstructions(patient: JournalPatient): string {
  return `You are the voice of a daily ADHD check-in journal. You are talking with ${patient.firstName}, who is managing an ADHD stimulant medication. This is a warm, ~60-90 second spoken check-in about how their day went. Your entire job is a good, brief conversation — you do NOT fill out any form or record any data. A separate system reads the transcript afterward.

CONVERSATION STYLE
- Open naturally and warmly, e.g. "Hey ${patient.firstName} — how'd today go?" Then let them talk.
- Listen narrative-first. Do NOT run a checklist. Let them ramble; follow what they bring up.
- Keep your turns short and human. Zero clinical jargon. No lists of questions.

ONE CONSOLIDATED PROBE (only if needed)
- By the end you'd ideally have heard three things: whether they took their meds today, how they slept, and their general mood. If the patient already covered these, do NOT ask about them again.
- If one or more of those is missing, ask ONCE, consolidated and casual — e.g. "Quick one before we wrap — did you take your meds today, and how'd you sleep?" Never more than one probing turn.
- In that same single probe, you may fold in ONE light, optional texture question — how they felt otherwise, or whether they ate okay today — but only briefly, only if it flows, and never as a separate turn. Keep it warm and conversational, e.g. "…and how'd you feel otherwise — eat alright?" If the moment doesn't call for it, skip it. This is a check-in, not a questionnaire.

SPOKEN RECAP, THEN END
- Close with a short spoken recap of what you heard, in plain language, e.g. "Logged: meds around 8:15, wore off mid-afternoon, slept about six hours, felt kind of irritable — sound right?"
- Let the patient confirm or correct. Their yes/no/correction is the last turn.
- Then call the end_session tool. Do not keep talking after the recap is confirmed.

HARD BOUNDARIES
- Never give medical advice. Never comment on, suggest, or question medication decisions or doses.
- Never diagnose or use symptom-checklist language.
- If the patient says anything about self-harm, chest pain/palpitations, running out of medication early / taking extra / sharing it, or feeling paranoid or unusually wired and not sleeping: acknowledge supportively and briefly — "thanks for telling me, I'll make sure your provider sees this" — and do NOT probe, advise, or dwell on it. Continue the check-in gently. You do not assess or route anything yourself; the provider-facing system handles that.
- Keep the whole thing under about 90 seconds. This is a check-in, not a therapy session.`;
}

// Full session object sent to POST /v1/realtime/client_secrets (mint time) and
// re-asserted via session.update on the data channel once it opens.
export function buildSessionConfig(patient: JournalPatient) {
  return {
    type: "realtime",
    model: REALTIME_MODEL,
    instructions: buildJournalInstructions(patient),
    audio: {
      input: {
        transcription: { model: INPUT_TRANSCRIPTION_MODEL },
        turn_detection: { type: "semantic_vad" },
      },
      output: { voice: REALTIME_VOICE },
    },
    tools: [END_SESSION_TOOL],
    tool_choice: "auto",
  };
}
