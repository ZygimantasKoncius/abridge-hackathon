# abridge-hackathon

Demo for the **ADHD Voice Check-In + Provider Digest** build ([spec](./adhd-checkin-spec.md)).

A sub-90-second daily voice journal auto-drafts the monthly ADHD follow-up
questionnaire and surfaces titration-relevant patterns, handing the provider a
digest where every claim links to a timestamped patient quote.

This branch runs the provider dashboard against deterministic sample data and
also includes the core backend pipeline (Next.js App Router + SQLite), including
the extraction, digest, and LLM analysis blocks. The realtime voice token mint
(§5b) remains frontend-only for the hackathon.

## Architecture

- **Next.js** (App Router, route handlers) — one app, API routes under `/api`.
- **SQLite** via `better-sqlite3` — three tables: `patients`, `entries`,
  `extractions`. Raw transcript **and** extraction JSON are both stored; the raw
  transcript is the audit trail and the evidence-snippet source.
- **Claude Opus 4.8** (`claude-opus-4-8`) for extraction — tool-use / structured
  output (`output_config.format`), not "respond in JSON" prompting. One
  extraction call per entry. All digest numbers are computed in code; the model
  only extracts and cites.

```
src/
  lib/
    schema.ts       frozen extraction schema (§4) + JSON Schema for structured output
    constructs.ts   ASRS-18 construct list + red-flag taxonomy + system prompt
    extraction.ts   Claude Opus 4.8 extraction call
    analysis.ts     Claude Opus 4.8 analysis block (§6) — bounded recommendation, stats in / prose out
    db.ts           SQLite connection + schema
    queries.ts      data access (insert entry+extraction, load digest rows)
    digest.ts       sample-data digest used by the provider dashboard
    server-digest.ts database-backed digest math (§6), all numbers in code
    receipt.ts      coverage-receipt chips (§5.4)
  app/api/
    entries/route.ts          POST — transcript -> extraction -> store
    entries/[id]/route.ts     PATCH — corrections from receipt chips
    digest/[pid]/route.ts     GET — computed 30-day digest
    patients/route.ts         GET — provider list summary
scripts/
  seed.ts           ~28 days x 2 patients, run through the REAL pipeline (§7)
```

## Setup

```bash
npm install
cp .env.example .env      # set ANTHROPIC_API_KEY (or use `ant auth login`)
npm run seed              # generate + extract synthetic data (needs the API key)
npm run dev               # http://localhost:3000
```

The provider UI at `/provider` uses committed sample data, so it works without
an API key or a seeded database. The API routes below use SQLite and the real
extraction pipeline.

## API

### `POST /api/entries`
```jsonc
// body
{ "patient_id": "patient-a", "transcript": "Agent: ...\nPatient: ...", "source": "realtime_voice", "duration": 74 }
// 201 response
{ "entry_id": "...", "extraction": { /* ExtractionData */ }, "chips": [ /* receipt chips */ ], "missing_required": [], "model": "claude-opus-4-8" }
```

### `PATCH /api/entries/[id]`
```jsonc
// body — field paths match the chip `field` values
{ "corrections": { "sleep_hours": 7, "mood.valence": "calm" } }
```

### `GET /api/digest/[pid]`
Computed 30-day digest: adherence, wear-off histogram, auto-drafted ASRS-18 with
evidence snippets, sparklines, aggregated agenda, red-flag channel. The
`analysis` block (overview + bounded "consider discussing X" recommendation,
§6) is generated at render time by Claude Opus 4.8 from the computed stats
(stats in, prose out). Pass `?analysis=0` to skip it during dev.

### `GET /api/patients`
Provider list: name, last entry, adherence %, red-flag indicator.

## Notes

- **Synthetic data only** — the demo-data disclaimer covers HIPAA questions.
- Seed data: Patient A (Alex) tells the wear-off/sleep decline story; Patient B
  (Sam) has one diversion-adjacent entry that fires the red-flag banner.
- SQLite lives at `./data/abridge.db` (gitignored). Delete it to reset.
- To speed up the seed batch during dev, set `EXTRACTION_MODEL=claude-sonnet-4-6`.
