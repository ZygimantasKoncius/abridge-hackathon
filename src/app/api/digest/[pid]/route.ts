import { NextRequest, NextResponse } from "next/server";
import { analyzeDigest } from "@/lib/analysis";
import { computeDigest } from "@/lib/server-digest";
import { getPatient, loadDigestEntries } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/digest/[pid]
// Returns the computed 30-day digest (spec §6). All numbers computed in code.
// The LLM analysis block (overview + bounded recommendation) is generated at
// render time — pass ?analysis=0 to skip it for fast dev iteration.
export async function GET(req: NextRequest, ctx: { params: Promise<{ pid: string }> }) {
  const { pid } = await ctx.params;

  const patient = getPatient(pid);
  if (!patient) {
    return NextResponse.json({ error: "unknown patient" }, { status: 404 });
  }

  const entries = loadDigestEntries(pid);
  const digest = computeDigest(patient, entries);

  const wantAnalysis = req.nextUrl.searchParams.get("analysis") !== "0";
  if (wantAnalysis && entries.length > 0) {
    try {
      digest.analysis = await analyzeDigest(digest);
    } catch (err) {
      // Fail soft — the digest math stands on its own; never let a bad analysis
      // call break the demo surface.
      console.error("analysis failed:", err);
      digest.analysis = null;
    }
  }

  return NextResponse.json(digest);
}
