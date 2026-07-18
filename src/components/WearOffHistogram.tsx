import type { Digest } from "@/lib/digest";

// The money chart (§6). Histogram of parsed wear-off times across the month.
// The modal bin is emphasized; everything else stays quiet.
export function WearOffHistogram({ wearOff }: { wearOff: Digest["wearOff"] }) {
  const max = Math.max(1, ...wearOff.bins.map((b) => b.count));

  return (
    <div>
      <div className="flex items-end gap-2 h-40">
        {wearOff.bins.map((b) => {
          const isModal = b.label === wearOff.modalLabel;
          const h = b.count === 0 ? 2 : (b.count / max) * 100;
          return (
            <div key={b.label} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
              <span
                className={`text-xs tnum font-mono ${
                  isModal ? "text-primary-ink font-semibold" : "text-ink-faint"
                }`}
              >
                {b.count || ""}
              </span>
              <div
                className="w-full rounded-t-[3px] transition-[height]"
                style={{
                  height: `${h}%`,
                  background: isModal ? "var(--color-primary)" : "var(--color-line-strong)",
                }}
              />
              <span
                className={`text-[0.7rem] font-mono ${
                  isModal ? "text-primary-ink font-medium" : "text-ink-faint"
                }`}
              >
                {b.label}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-ink-muted leading-relaxed">
        {wearOff.modalTime ? (
          <>
            Medication wears off near{" "}
            <span className="font-mono text-primary-ink font-medium">{wearOff.modalTime}</span>{" "}
            on{" "}
            <span className="text-ink font-semibold tnum">
              {wearOff.reported} of {wearOff.ofMedicated}
            </span>{" "}
            medicated days.{" "}
            <span className="text-ink-faint">
              A monthly-recall visit never surfaces this distribution.
            </span>
          </>
        ) : (
          "No consistent wear-off time reported this month."
        )}
      </p>
    </div>
  );
}
