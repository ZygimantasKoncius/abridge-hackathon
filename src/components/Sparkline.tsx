import type { SparklinePoint } from "@/lib/digest";

interface Props {
  points: SparklinePoint[];
  width?: number;
  height?: number;
  color?: string;
  domain?: [number, number]; // fixed value range; auto if omitted
}

// Minimal SVG sparkline. Null values create gaps (a missed day is data).
export function Sparkline({
  points,
  width = 220,
  height = 40,
  color = "var(--color-primary)",
  domain,
}: Props) {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length < 2) {
    return (
      <div className="text-xs text-ink-faint" style={{ height }}>
        not enough data
      </div>
    );
  }
  const min = domain ? domain[0] : Math.min(...vals);
  const max = domain ? domain[1] : Math.max(...vals);
  const span = max - min || 1;
  const pad = 3;
  const stepX = (width - pad * 2) / (points.length - 1);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  // Build path segments, breaking on nulls.
  const segments: string[] = [];
  let cur: string[] = [];
  points.forEach((p, i) => {
    if (p.value == null) {
      if (cur.length) segments.push(cur.join(" "));
      cur = [];
      return;
    }
    const cmd = cur.length === 0 ? "M" : "L";
    cur.push(`${cmd}${(pad + i * stepX).toFixed(1)},${y(p.value).toFixed(1)}`);
  });
  if (cur.length) segments.push(cur.join(" "));

  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      role="img"
      aria-hidden
    >
      {segments.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {last.value != null && (
        <circle
          cx={pad + (points.length - 1) * stepX}
          cy={y(last.value)}
          r={2.5}
          fill={color}
        />
      )}
    </svg>
  );
}
