# Spec: ADHD Voice Check-In + Provider Digest (Hackathon Build)

## 1. Problem & Thesis

ADHD stimulant treatment is a Schedule II workflow: no auto-refills, ~30-day scripts, forced monthly follow-ups. Those visits run on patient recall of the past month — which is lossy in general and worst-case lossy for an ADHD population. Meanwhile the visit itself is highly protocolized (ASRS symptom review, side-effect checklist, safety screen, dose decision).

**Thesis:** a sub-90-second daily voice journal can auto-draft the monthly questionnaire, surface titration-relevant patterns (coverage gaps, sleep/appetite trends) that monthly recall misses, and hand the provider a digest where every claim links to timestamped patient quotes.

**Positioning guardrail:** the product surfaces *what changed, mapped to the questions the provider already asks*. It does not recommend doses. Decision support framing, not decision making.

## 2. Users & Core Loops

**Patient:** opens `/journal`, records one voice note per day (<90s total interaction), answers at most one follow-up, sees a "coverage receipt" confirming what was understood, corrects via chips if needed.

**Provider:** opens `/provider` before a visit, sees patient list → patient detail: 30-day digest, auto-drafted ASRS-18 with evidence links, trend sparklines, red-flag banner, patient's stated visit agenda.

## 3. Architecture

One app, two routes, one database. No separate services.

```
Next.js (or FastAPI + React — whichever the team is fastest in)
├── /journal                patient: voice conversation → receipt
├── /provider               patient list
├── /provider/[id]          digest view (the demo surface)
├── /api/realtime-session   POST → mint ephemeral OpenAI Realtime token
├── /api/entries            POST transcript → extraction → store
├── /api/entries/[id]       PATCH corrections from receipt chips
└── /api/digest/[pid]       GET computed 30-day digest
```

- **DB:** SQLite (or Postgres if deploying). Three tables: `patients`, `entries`, `extractions`. Store raw transcript AND extraction JSON — raw transcript is the audit trail and the evidence-snippet source.
- **Voice:** OpenAI Realtime API (speech-to-speech) embedded in `/journal` via WebRTC. Backend mints an ephemeral session token; browser connects directly to OpenAI; session instructions carry the journal persona. The API handles VAD, barge-in, and TTS. On session end, the full input/output transcript posts to `/api/entries`. Fallback path (feature-flagged): plain Web Speech API recorder, kept as the on-stage insurance policy.
- **LLM (everything except voice): Anthropic Claude Opus 4.8** (`claude-opus-4-8`), tool-use/structured output mode — not "respond in JSON" prompting. Covers: per-entry extraction, the provider overview + recommendation analysis, and seed-transcript generation. OpenAI is used *only* for the realtime voice conversation; the clinical record pipeline is Anthropic end-to-end. One extraction call per entry; one analysis call per digest render. All numbers in the digest are computed in code; the model only extracts, cites, and phrases. (If batch-extracting 56 seed entries feels slow/pricey during dev iteration, `claude-sonnet-4-6` is a drop-in for the extraction call — keep Opus 4.8 for the provider analysis either way, since that's the judgment-heavy prose surface.)
- **No auth.** Hardcode 1 provider, 2–3 patients. Demo data disclaimer covers HIPAA questions.

## 4. Extraction Schema (the heart of the build)

One prompt, one schema, applied to every entry. Every extracted field carries an `evidence` snippet quoted from the transcript.

```json
{
  "med_taken": true,
  "med_time": "8:15am",
  "wear_off_time": "2:30pm",
  "crash_reported": true,
  "sleep_hours": 6,
  "sleep_quality": "poor",
  "appetite": {"status": "reduced", "evidence": "skipped lunch again"},
  "mood": {"valence": "irritable", "evidence": "snapped at a coworker"},
  "caffeine_alcohol_cannabis": {"mentioned": true, "detail": "3 coffees"},
  "asrs_signals": [
    {"item": 7, "construct": "losing_things", "evidence": "couldn't find my keys this morning"}
  ],
  "functional_mentions": [
    {"domain": "work", "valence": "negative", "evidence": "missed the standup"}
  ],
  "side_effects": [
    {"type": "headache", "evidence": "dull headache all afternoon"}
  ],
  "red_flags": [],
  "visit_agenda_items": ["wants to ask about the afternoon crash"]
}
```

**Required fields (trigger follow-up if null):** `med_taken`, `sleep_hours` or `sleep_quality`, `mood`. Everything else is opportunistic. Three required fields ≈ follow-up fires ~30% of days (attentive), not 100% (quiz).

**ASRS mapping:** the 18 `asrs_signals.item` values map 1:1 to the 18 DSM-5-TR symptom constructs (9 inattention, 9 hyperactivity/impulsivity). Ship the construct list + plain-language descriptions inside the extraction prompt.

**Red-flag taxonomy (separate channel, never summarized away):**
- `suicidality_language`
- `diversion_signal` (ran out early, taking extra, sharing)
- `cardiac` (chest pain, palpitations, fainting)
- `psychosis_mania` (racing thoughts beyond baseline, paranoia, not sleeping + elevated)
- `substance_escalation`

Red flags render as a banner at the top of the provider view with the raw quote and timestamp. They are excluded from the LLM narrative summary and routed to their own UI element.

## 5. Patient UX Flow (`/journal`) — conversational voice

1. **Landing:** today's date, one big "Start check-in" button, nothing else.
2. **Session:** the agent opens ("Hey — how'd today go?") and the patient talks naturally. The agent listens narrative-first: it does NOT run down a checklist; it lets the patient ramble, then probes **once, consolidated** for whatever required fields weren't covered ("Quick one before we wrap — did you take your meds today, and how'd you sleep?"). Barge-in supported (patient can interrupt). Live transcript scrolls faintly during the session.
3. **Verbal wrap-up:** agent closes with a spoken recap ("Logged: meds at 8:15, wore off around 2:30, slept about six hours, skipped lunch, felt irritable — sound right?"). Patient's yes/no/correction is the last turn of the session.
4. **Coverage receipt (kept):** session ends → transcript runs through the extraction pipeline → **chips per captured field** render on screen — `Slept ~6h · Meds 8:15am · Wore off ~2:30 · Skipped lunch · Mood: irritable`. Tap a chip to correct (PATCH endpoint). Gap-probing already happened in-session, so this screen is pure confirmation + provenance, not a follow-up form.
5. **Done:** "See you tomorrow." Target total session: under 90 seconds. Missed days are data, not failures — no streaks, no shame mechanics.

**Agent persona constraints (session instructions):** warm, brief, zero clinical jargon; never more than one probing turn; never asks about symptoms checklist-style; never gives medical advice or comments on medication decisions; if the patient says something matching the red-flag taxonomy, the agent acknowledges supportively without probing further ("thanks for telling me — I'll make sure your provider sees this") — detection and routing happen in the backend extraction pass, not in the conversation.

## 5b. Voice Integration: OpenAI Realtime API (~3–4h)

- **Transport:** WebRTC, browser ↔ OpenAI directly, **GA interface only** (beta/preview shape is deprecated — don't copy old tutorials). Backend endpoint (`/api/realtime-session`) mints an ephemeral client token via `POST /v1/realtime/client_secrets`; browser initializes WebRTC against `/v1/realtime/calls`. **Model: `gpt-realtime-2.1-mini`** (latest generation; mini is plenty for a 90-second persona and audio-output pricing on the full model adds up) — upgrade to `gpt-realtime-2.1` only if instruction-following disappoints in rehearsal. Enable patient-side transcription via `session.audio.input.transcription` (`gpt-4o-mini-transcribe`) so we get the patient's words, not just the agent's.
- **Division of labor:** OpenAI Realtime owns the *conversation* (VAD, turn-taking, barge-in, TTS, in-session gap probing per the persona instructions). Our backend owns the *record*: on session end, the client posts `{patient_id, transcript, source: "realtime_voice", duration}` to `/api/entries`, and our extraction prompt (Claude Opus 4.8, structured output) runs as the single source of truth. The voice agent never writes structured data — same trust argument as before: conversation and extraction are decoupled, and every digest claim cites the transcript.
- **Session-end signal:** simplest reliable pattern is a `end_session` function/tool exposed to the realtime agent, called after the verbal wrap-up; the client treats that event as "harvest transcript and POST." (Fallback: explicit "End check-in" button.)
- **Cost/limits:** realtime audio pricing is per-minute-ish and irrelevant at demo scale; put a 3-minute hard cap on sessions anyway so a rambling demo can't run away.
- **Stage insurance:** keep the dumb Web Speech API recorder behind a feature flag (`?mode=simple`). It shares `/api/entries` and the receipt UI, so if conference wifi kills WebRTC mid-demo, you flip a query param and the demo continues. Rehearse both paths.
- **Roadmap extension (slide, not build):** the same decoupling feeds a Twilio ↔ Realtime phone line — patients without smartphones call in. Accessibility flex; reinforces that capture surface is config.

## 6. Provider UX Flow (`/provider`)

**Patient list:** name, last entry date, adherence %, red-flag indicator dot.

**Patient detail (the demo surface — spend the most build time here):**
- **Red-flag banner** (if any): flag type, quote, timestamp, "n days ago."
- **Headline deltas:** adherence % (vs. prior month), avg sleep (trend arrow), appetite-mention trend, wear-off time distribution.
- **Coverage pattern module:** histogram of `wear_off_time` across the month. This is the money chart — "wears off ~2:30pm on 14 of 22 medicated days" is a formulation-change signal a monthly recall never produces.
- **Auto-drafted ASRS-18:** each of the 18 items shows a drafted frequency answer (Never/Rarely/Sometimes/Often/Very Often) derived from signal counts, and clicking any item expands the supporting snippets with dates. Items with no evidence show "not observed — ask in visit." Frame as *draft for provider confirmation*, never as completed instrument.
- **Sparklines:** sleep hours, mood valence, appetite (30 days).
- **Patient agenda:** aggregated `visit_agenda_items` ("Patient wants to discuss: afternoon crash").
- **LLM analysis (top of page, above the fold):** two parts, generated at render time from the computed stats + evidence snippets (stats in, prose out — the model never invents numbers):
  - **Overview — 2 sentences max, only if something sticks out.** E.g. "Sleep has declined from ~7h to ~5.5h over the past two weeks, coinciding with a consistent mid-afternoon wear-off pattern (14 of 22 medicated days). Symptom mentions in the losing-things and task-completion domains increased over the same window." If nothing is notable: single line, "No significant changes since last visit." — silence is a feature, not a failure.
  - **Recommendation — one line, phrased as a discussion prompt, chosen from a bounded option set:** formulation/coverage change (IR↔XR, afternoon booster), dose-timing shift, sleep conversation (hygiene first; sleep-aid discussion if pattern persists), confounder workup (sleep, substances, thyroid, stress), side-effect management, or "continue current regimen." E.g. "Consider discussing an XR formulation or afternoon booster; the sleep trend may warrant addressing before any dose change." Each recommendation renders with its supporting stat inline.
  - **Wording guardrail (enforced in the prompt):** always "consider discussing X," never "prescribe/increase/start X." The bounded option set + provider-confirms framing is what keeps this decision *support* rather than decision *making* — same demo punch, defensible in Q&A.
  - Red flags never appear in this block; they stay in the banner channel.

**Digest math (all in code, not LLM):**
- Adherence = medicated days / journaled days
- Wear-off distribution = histogram of parsed times
- ASRS draft answer = signal count for that construct bucketed: 0 → not observed; 1–2 → Sometimes; 3–5 → Often; 6+ → Very Often (tune against seed data)
- Deltas = current 30d vs. prior 30d where seed data exists

## 7. Seed Data (do not skip)

Script that generates ~28 days of synthetic transcripts for 2 patients, run through the **real** extraction pipeline (proves the pipeline at n=28, not n=1).

- **Patient A (main demo):** weeks 1–2 stable; weeks 3–4 develop a consistent ~2:30pm wear-off pattern + sleep degrading 7h → 5.5h + 5–6 losing-things mentions. Digest should visibly tell the "consider XR/booster discussion" story.
- **Patient B (red-flag demo):** mostly stable, one entry containing an early-refill/diversion-adjacent phrase → banner demo.

## 8. Explicit Cut List

No auth · no HIPAA infrastructure (demo-data disclaimer) · no native app · no push notifications · no streaks · no weekly-prompt tier (daily conversation + opportunistic extraction covers it) · no e-prescribing · no EHR/FHIR integration (roadmap slide only) · no ChatGPT/Custom-GPT surface (voice runs on OpenAI Realtime API inside our app, §5b) · no phone line (Twilio is a roadmap slide) · no prescriptive medication directives ("increase to 20mg") — the analysis block issues bounded "consider discussing X" prompts only, and the voice agent never discusses medication decisions.

## 9. Build Plan & Time Budget (2 people, one weekend)

| Block | Est. | Notes |
|---|---|---|
| Extraction prompt + schema + eval on 5 hand-written transcripts | 2–3h | First commit. Iterate here the most — this is the product. |
| Seed generator + run pipeline on 56 entries | 1–2h | Unblocks dashboard work with real-shaped data. |
| Realtime voice: token endpoint + WebRTC client + persona instructions + end_session tool | 3–4h | Start from OpenAI's WebRTC reference example, don't hand-roll. Persona prompt iterates alongside extraction prompt. |
| Receipt UI + correction chips (post-session) | 1.5h | Shared by both voice modes. |
| `?mode=simple` fallback recorder | 1h | Web Speech API → same `/api/entries`. Stage insurance; build after Realtime works. |
| Digest aggregation functions + API | 2h | Pure functions over extraction rows; unit-testable. |
| Provider dashboard | 4–5h | Demo surface. ASRS expandable items + wear-off histogram are the priority widgets. |
| Overview + recommendation analysis prompt + red-flag banner | 1.5h | Bounded option set lives in the prompt; test that "nothing notable" cases stay quiet. |
| Polish, deploy, rehearse demo | 3h | Rehearse both voice modes, timed. |

**Parallelization:** Person 1 owns extraction prompt → seed data → digest math. Person 2 owns journal UX → provider dashboard. Interface contract = the extraction schema; freeze it by Saturday noon.

## 10. Demo Script (3 minutes)

1. **Live voice check-in (60s):** start a session on stage → ramble a deliberately incomplete entry → agent probes once for the missing sleep field → verbal recap → receipt chips appear on screen with the extracted values. (The conversational beat and the provenance beat in one take. If WebRTC dies: flip to `?mode=simple` and keep moving — the receipt looks identical.)
2. **Provider view (90s):** open Patient A → the 2-sentence analysis flags the sleep decline + wear-off pattern with "consider discussing XR or afternoon booster" → wear-off histogram backs it ("this pattern is invisible to a monthly visit") → click ASRS item 7 → six timestamped snippets → patient agenda item matches the crash pattern.
3. **Red flag (15s):** flip to Patient B, show the banner and the routing argument (safety channel ≠ summary channel) — and note the agent's in-session behavior: acknowledge supportively, never probe, route to the provider.
4. **Close (15s):** "The questionnaire filled itself out, and every answer has receipts. OpenAI Realtime handles the conversation; Claude Opus 4.8 owns the clinical record — extraction, analysis, all auditable and re-runnable. ADHD is the demo; instrument, required fields, and red-flag taxonomy are config."

## 11. Judge Q&A Prep

- *"How do you know the digest isn't hallucinated?"* → Stats are computed in code; the LLM only extracts and cites; every claim links to a quote; the patient confirmed extractions via receipt chips.
- *"Is this a medical device?"* → Demo framing: documentation and visit-prep support; the analysis issues bounded "consider discussing" prompts, never directives; the provider confirms everything and makes every treatment decision. Real path: wellness/documentation positioning first, CDS guidance analysis later.
- *"HIPAA?"* → Synthetic data today; production path is BAA-covered LLM endpoints (Bedrock/Vertex/Anthropic BAA), standard PHI handling. (You can go deeper here than they can.)
- *"Why voice?"* → Lowest-friction daily capture for the worst-case-consistency population; narrative-first captures unprompted signal a form never elicits.
- *"Why doesn't the voice agent just fill out the questionnaire directly?"* → Deliberate decoupling: the realtime agent optimizes for conversation quality; a separate structured-output extraction pass over the transcript is auditable, re-runnable, and cites evidence. If we improve the extraction prompt, we can re-extract every historical entry — you can't re-run a conversation.
- *"Why two model providers?"* → Best tool per job: OpenAI Realtime is the strongest speech-to-speech conversation layer; Claude Opus 4.8 is the strongest model for careful structured extraction and clinical-register prose. The seam between them (transcript in, JSON out) is exactly where auditability lives — and it means either side is swappable.
