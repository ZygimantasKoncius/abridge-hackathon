import { NextRequest, NextResponse } from "next/server";
import {
  buildSessionConfig,
  resolvePatient,
  REALTIME_MODEL,
} from "@/lib/journal-persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/realtime-session
// Mints a short-lived ephemeral OpenAI Realtime client secret (spec §5b). This
// is the ONE piece of "backend" the frontend owns — the repo's .env.example and
// README designate the realtime token mint as frontend territory, kept off the
// clinical pipeline. The standard OPENAI_API_KEY never leaves the server; the
// browser only ever receives the ephemeral value.
//
// Body: { patient_id?: string }  → returns the OpenAI client_secrets response
// (contains `value` = ephemeral key) plus the model the client should dial.
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not set. Add it to .env to enable the voice check-in.",
      },
      { status: 500 },
    );
  }

  let patientId: string | undefined;
  try {
    const body = (await req.json()) as { patient_id?: string };
    patientId = body?.patient_id;
  } catch {
    // Empty body is fine — falls back to the default patient.
  }
  const patient = resolvePatient(patientId);

  let openaiRes: Response;
  try {
    openaiRes = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ session: buildSessionConfig(patient) }),
    });
  } catch (err) {
    console.error("realtime token mint failed:", err);
    return NextResponse.json(
      { error: "could not reach OpenAI to mint a session token" },
      { status: 502 },
    );
  }

  if (!openaiRes.ok) {
    const detail = await openaiRes.text();
    console.error("realtime token mint rejected:", openaiRes.status, detail);
    return NextResponse.json(
      { error: "OpenAI rejected the session request", detail },
      { status: 502 },
    );
  }

  const token = await openaiRes.json();
  return NextResponse.json({ token, model: REALTIME_MODEL });
}
