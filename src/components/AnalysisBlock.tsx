import type { Analysis } from "@/lib/digest";

// Above-the-fold render-time analysis (§6). Serif italic marks it as *drafted
// prose* — machine-generated narrative, distinct from the computed data around
// it. Stays quiet when nothing sticks out. Always "consider discussing X".
export function AnalysisBlock({ analysis }: { analysis: Analysis }) {
  return (
    <section className="reveal">
      <div className="flex items-center gap-2 mb-3">
        <span className="eyebrow">Draft analysis</span>
        <span className="text-[0.7rem] text-ink-faint font-mono">
          generated from computed stats · provider confirms
        </span>
      </div>

      {analysis.overview == null ? (
        <p className="font-serif text-lg text-ink-muted italic">
          No significant changes since last visit.
        </p>
      ) : (
        <>
          <p className="font-serif text-[1.35rem] leading-snug text-ink italic max-w-3xl">
            {analysis.overview}
          </p>

          {analysis.recommendation && (
            <div className="mt-5 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-5 max-w-3xl">
              <span className="eyebrow shrink-0 sm:pt-1.5" style={{ color: "var(--color-primary)" }}>
                Discussion prompt
              </span>
              <div className="border-l-2 border-primary pl-4">
                <p className="text-[0.95rem] text-ink font-medium leading-relaxed">
                  {analysis.recommendation.text}
                </p>
                <p className="mt-1.5 font-mono text-xs text-primary-ink tabular-nums">
                  {analysis.recommendation.stat}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
