import { NextResponse } from "next/server";
import { getPatientWithEntries, getViewAnalysis } from "@/lib/patient-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/patients/[id]
// Returns the patient (with entries, in the UI's types.ts shape) plus the
// cached LLM analysis. The provider detail page fetches this and runs the
// client-side computeDigest over it.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const patient = getPatientWithEntries(id);
  if (!patient) {
    return NextResponse.json({ error: "unknown patient" }, { status: 404 });
  }
  return NextResponse.json({ patient, analysis: getViewAnalysis(id) });
}
