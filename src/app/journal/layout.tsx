import type { ReactNode } from "react";

// Patient-facing shell (spec §5). Deliberately quieter than the provider chrome:
// no dense navigation, one calm centered column. Clinical framing stays out of
// the patient's way.
export default function JournalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-lg px-6 h-14 flex items-center justify-between">
          <span className="font-mono text-sm font-semibold tracking-tight text-ink">
            throughline
          </span>
          <span className="hidden sm:block font-mono text-[0.7rem] text-ink-faint uppercase tracking-wider">
            Daily check-in
          </span>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-lg px-6 flex items-center justify-center py-16">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-lg px-6 py-4 text-center text-xs text-ink-faint">
          Synthetic demo · not medical advice
        </div>
      </footer>
    </div>
  );
}
