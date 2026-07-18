import { resolvePatient } from "@/lib/journal-persona";
import { JournalSession } from "./JournalSession";

export const dynamic = "force-dynamic";

// Patient voice check-in (spec §5). Defaults to patient-a so a live check-in
// lands in the provider view; ?patient=patient-b switches roster entry. No auth
// (spec §3) — the id maps to the seeded roster.
export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { patient: patientParam } = await searchParams;
  const patient = resolvePatient(patientParam);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return <JournalSession patient={patient} today={today} />;
}
