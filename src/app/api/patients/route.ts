import { NextResponse } from "next/server";
import { computeDigest } from "@/lib/digest";
import { listPatients, loadDigestEntries } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/patients
// Provider patient-list summary (spec §6): name, last entry date, adherence %,
// red-flag indicator. Convenience endpoint for the /provider page.
export async function GET() {
  const patients = listPatients();
  const summary = patients.map((p) => {
    const entries = loadDigestEntries(p.id);
    const digest = computeDigest(p, entries);
    return {
      id: p.id,
      name: p.name,
      medication: p.medication,
      dose: p.dose,
      last_entry: digest.window.end,
      journaled_days: digest.window.journaledDays,
      adherence_pct: digest.headline.adherence.pct,
      has_red_flag: digest.redFlags.length > 0,
      red_flag_count: digest.redFlags.length,
    };
  });
  return NextResponse.json({ patients: summary });
}
