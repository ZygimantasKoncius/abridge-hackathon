import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-surface border border-line rounded-[var(--radius-card)] ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHead({
  eyebrow,
  title,
  aside,
}: {
  eyebrow: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <p className="eyebrow mb-1">{eyebrow}</p>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
      </div>
      {aside && <div className="shrink-0 text-right">{aside}</div>}
    </div>
  );
}

export function TrendArrow({
  direction,
  sentiment,
}: {
  direction: "up" | "down" | "flat";
  sentiment: "good" | "warn" | "neutral";
}) {
  const color =
    sentiment === "good"
      ? "var(--color-good)"
      : sentiment === "warn"
        ? "var(--color-warn)"
        : "var(--color-ink-faint)";
  const rotate = direction === "up" ? 0 : direction === "down" ? 180 : 90;
  if (direction === "flat") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <line x1="2" y1="6" x2="10" y2="6" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      style={{ transform: `rotate(${rotate}deg)` }}
      aria-hidden
    >
      <path
        d="M6 2v8M3 5l3-3 3 3"
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
