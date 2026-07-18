import Link from "next/link";
import type { ReactNode } from "react";

export default function ProviderLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/85 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6 h-14 flex items-center justify-between">
          <Link href="/provider" className="flex items-baseline gap-2.5 group">
            <span className="font-mono text-sm font-semibold tracking-tight text-ink">
              throughline
            </span>
            <span className="text-ink-faint text-xs group-hover:text-ink-muted transition-colors">
              provider
            </span>
          </Link>
          <span className="hidden sm:block font-mono text-[0.7rem] text-ink-faint uppercase tracking-wider">
            Synthetic demo data · not PHI
          </span>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-8">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between text-xs text-ink-faint">
          <span>
            Documentation &amp; visit-prep support. Decision support, not decision making.
          </span>
          <span className="font-mono">every claim links to a patient quote</span>
        </div>
      </footer>
    </div>
  );
}
