import { NextRequest, NextResponse } from "next/server";
import { getExtractionByEntry, updateExtractionData } from "@/lib/queries";
import { buildChips } from "@/lib/receipt";
import { ExtractionData } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fields a receipt chip is allowed to correct (spec §5.4). Nested paths are
// dot-delimited and match the `field` values emitted by buildChips().
const ALLOWED_PATHS = new Set([
  "med_taken",
  "med_time",
  "wear_off_time",
  "crash_reported",
  "sleep_hours",
  "sleep_quality",
  "appetite.status",
  "appetite.evidence",
  "mood.valence",
  "mood.evidence",
  "caffeine_alcohol_cannabis.detail",
]);

function applyCorrection(data: ExtractionData, path: string, value: unknown): void {
  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = data;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (node[key] === null || node[key] === undefined) {
      // Instantiate the parent object so a null field can be corrected.
      node[key] = key === "appetite" ? { status: null, evidence: null }
        : key === "mood" ? { valence: null, evidence: null }
        : key === "caffeine_alcohol_cannabis" ? { mentioned: true, detail: null }
        : {};
    }
    node = node[key];
  }
  node[parts[parts.length - 1]] = value;
}

// PATCH /api/entries/[id]
// Body: { corrections: { "<field path>": value, ... } }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const existing = getExtractionByEntry(id);
  if (!existing) {
    return NextResponse.json({ error: "no extraction for that entry" }, { status: 404 });
  }

  let body: { corrections?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const corrections = body.corrections ?? {};
  const invalid = Object.keys(corrections).filter((k) => !ALLOWED_PATHS.has(k));
  if (invalid.length) {
    return NextResponse.json(
      { error: `unsupported correction field(s): ${invalid.join(", ")}` },
      { status: 400 },
    );
  }

  const data = JSON.parse(existing.data) as ExtractionData;
  const prevCorrected = new Set<string>(JSON.parse(existing.corrected_fields));

  for (const [path, value] of Object.entries(corrections)) {
    applyCorrection(data, path, value);
    prevCorrected.add(path);
  }

  const updated = updateExtractionData(id, data, [...prevCorrected]);

  return NextResponse.json({
    entry_id: id,
    extraction: data,
    chips: buildChips(data),
    corrected_fields: updated ? JSON.parse(updated.corrected_fields) : [],
  });
}
