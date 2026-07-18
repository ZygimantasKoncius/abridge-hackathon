import { ExtractionData } from "./schema";

// Coverage-receipt chips (spec §5.4). After a session, the transcript runs
// through extraction and we render one chip per captured field. Tapping a chip
// corrects it via the PATCH endpoint — so each chip carries the `field` path it
// targets. This is pure confirmation + provenance, not a follow-up form.

export interface ReceiptChip {
  field: string; // JSON path the PATCH endpoint understands, e.g. "sleep_hours"
  label: string;
  value: string | number | boolean;
}

export function buildChips(d: ExtractionData): ReceiptChip[] {
  const chips: ReceiptChip[] = [];

  if (d.med_taken === true && d.med_time) {
    chips.push({ field: "med_time", label: `Meds ${d.med_time}`, value: d.med_time });
  } else if (d.med_taken === false) {
    chips.push({ field: "med_taken", label: "No meds today", value: false });
  }

  if (d.wear_off_time) {
    chips.push({ field: "wear_off_time", label: `Wore off ~${d.wear_off_time}`, value: d.wear_off_time });
  }

  if (d.crash_reported === true) {
    chips.push({ field: "crash_reported", label: "Afternoon crash", value: true });
  }

  if (d.sleep_hours !== null) {
    chips.push({ field: "sleep_hours", label: `Slept ~${d.sleep_hours}h`, value: d.sleep_hours });
  } else if (d.sleep_quality) {
    chips.push({ field: "sleep_quality", label: `Sleep: ${d.sleep_quality}`, value: d.sleep_quality });
  }

  if (d.appetite?.status && d.appetite.status !== "normal") {
    chips.push({
      field: "appetite.status",
      label: d.appetite.status === "reduced" ? "Appetite reduced" : "Appetite up",
      value: d.appetite.status,
    });
  }

  if (d.mood?.valence) {
    chips.push({ field: "mood.valence", label: `Mood: ${d.mood.valence}`, value: d.mood.valence });
  }

  for (const se of d.side_effects) {
    chips.push({ field: "side_effects", label: `Side effect: ${se.type}`, value: se.type });
  }

  if (d.caffeine_alcohol_cannabis?.mentioned && d.caffeine_alcohol_cannabis.detail) {
    chips.push({
      field: "caffeine_alcohol_cannabis.detail",
      label: d.caffeine_alcohol_cannabis.detail,
      value: d.caffeine_alcohol_cannabis.detail,
    });
  }

  return chips;
}
