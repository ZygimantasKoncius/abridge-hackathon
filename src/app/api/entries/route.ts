import { NextRequest, NextResponse } from "next/server";
import { extractEntry } from "@/lib/extraction";
import { getPatient, insertEntryWithExtraction } from "@/lib/queries";
import { buildChips } from "@/lib/receipt";
import { missingRequiredFields } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/entries
// Body: { patient_id, transcript, source?, duration?, entry_date? }
// Runs the transcript through the Claude extraction pipeline (single source of
// truth) and stores raw transcript + extraction JSON. Returns the receipt chips.
export async function POST(req: NextRequest) {
  let body: {
    patient_id?: string;
    transcript?: string;
    source?: string;
    duration?: number;
    entry_date?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.patient_id || typeof body.patient_id !== "string") {
    return NextResponse.json({ error: "patient_id is required" }, { status: 400 });
  }
  if (!body.transcript || typeof body.transcript !== "string" || !body.transcript.trim()) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }
  if (!getPatient(body.patient_id)) {
    return NextResponse.json({ error: "unknown patient_id" }, { status: 404 });
  }

  let extraction;
  try {
    extraction = await extractEntry(body.transcript);
  } catch (err) {
    console.error("extraction failed:", err);
    return NextResponse.json({ error: "extraction failed" }, { status: 502 });
  }

  const { entry } = insertEntryWithExtraction(
    {
      patient_id: body.patient_id,
      transcript: body.transcript,
      source: body.source,
      duration_seconds: body.duration ?? null,
      entry_date: body.entry_date,
    },
    extraction,
  );

  return NextResponse.json(
    {
      entry_id: entry.id,
      entry_date: entry.entry_date,
      extraction: extraction.data,
      chips: buildChips(extraction.data),
      missing_required: missingRequiredFields(extraction.data),
      model: extraction.model,
    },
    { status: 201 },
  );
}
