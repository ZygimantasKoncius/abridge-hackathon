import { NextRequest, NextResponse } from "next/server";
import { ANALYSIS_MODEL, analyzeDigest } from "@/lib/analysis";
import { AnalysisResult, computeDigest } from "@/lib/server-digest";
import {
  getPatient,
  getPatientDataSignature,
  getStoredAnalysis,
  loadDigestEntries,
  saveAnalysis,
} from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/digest/[pid]
// Returns the computed 30-day digest (spec §6). All numbers computed in code.
//
// The LLM analysis block is CACHED per patient and regenerated only when the
// underlying data changes (a new entry or a correction), so repeated provider
// views serve the cached copy in a few ms instead of re-paying the ~5-15s Opus
// call. Query params:
//   ?analysis=0  skip analysis entirely (fast dev)
//   ?refresh=1   force-regenerate even if the cache is fresh
export async function GET(req: NextRequest, ctx: { params: Promise<{ pid: string }> }) {
  const { pid } = await ctx.params;

  const patient = getPatient(pid);
  if (!patient) {
    return NextResponse.json({ error: "unknown patient" }, { status: 404 });
  }

  const entries = loadDigestEntries(pid);
  const digest = computeDigest(patient, entries);

  const wantAnalysis = req.nextUrl.searchParams.get("analysis") !== "0";
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

  if (wantAnalysis && entries.length > 0) {
    const signature = getPatientDataSignature(pid);
    const stored = getStoredAnalysis(pid);

    if (!forceRefresh && stored && stored.signature === signature) {
      // Cache hit — data unchanged since the analysis was computed.
      digest.analysis = JSON.parse(stored.data) as AnalysisResult;
    } else {
      try {
        const result = await analyzeDigest(digest);
        saveAnalysis(pid, result, signature, ANALYSIS_MODEL);
        digest.analysis = result;
      } catch (err) {
        // Fail soft: serve the stale cached analysis if we have one, else null.
        console.error("analysis failed:", err);
        digest.analysis = stored ? (JSON.parse(stored.data) as AnalysisResult) : null;
      }
    }
  }

  return NextResponse.json(digest);
}
