import { NextResponse } from "next/server";
import { computeDigest } from "@/lib/digest";
import { getPatient, loadDigestEntries } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/digest/[pid]
// Returns the computed 30-day digest (spec §6). All numbers computed in code.
// The LLM analysis block is deferred (`analysis: null`).
export async function GET(_req: Request, ctx: { params: Promise<{ pid: string }> }) {
  const { pid } = await ctx.params;

  const patient = getPatient(pid);
  if (!patient) {
    return NextResponse.json({ error: "unknown patient" }, { status: 404 });
  }

  const entries = loadDigestEntries(pid);
  const digest = computeDigest(patient, entries);
  return NextResponse.json(digest);
}
