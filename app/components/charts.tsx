"use client";

import { useAnimatedNumber } from "./animated-number";

/** Small dependency-free chart primitives. Every chart has a text summary for screen readers. */

export function ProgressRing({
  percent,
  label,
  size = 132,
}: {
  percent: number;
  label: string;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  // Fills from empty when it appears, then eases between values (Apple Fitness rings).
  const shown = useAnimatedNumber(p, 0, 900);
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${p}% ${label}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-fill"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          // The round cap leaves a dot of about 3% even at 0, so the last blue fades out over those few percent instead of vanishing.
          opacity={Math.min(1, shown / 3)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-text number-tabular">{Math.round(shown)}%</span>
    </div>
  );
}

interface HBarRow {
  label: string;
  value: number;
  display: string;
}

export function HBars({ rows }: { rows: HBarRow[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="hbars-label">{r.label}</span>
          <span className="hbars-track" aria-hidden="true">
            <span className="hbars-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="hbars-value number-tabular">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A line and nothing else (no dots). A `null` value is a day with no entry: the line skips it, so a window of days
 * with few entries still draws; a single entry is a flat line across and none leaves the empty grid.
 */
export function LineChart({
  points,
  summary,
  height = 140,
}: {
  points: { label: string; value: number | null; at?: number }[];
  summary: string;
  height?: number;
}) {
  if (points.length < 2) return null;
  const w = 600;
  const pad = 8;
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 0;
  const span = hi - lo || 1;
  // With a position per point (a day number), the gaps between points are drawn as long as they are; without, they are evenly spaced.
  const placed = points.every((p) => p.at !== undefined);
  const first = points[0].at ?? 0;
  const run = (points[points.length - 1].at ?? 0) - first || 1;
  const x = (i: number) => pad + ((placed ? ((points[i].at ?? 0) - first) / run : i / (points.length - 1)) * (w - 2 * pad));
  const y = (v: number) => (hi === lo ? height / 2 : pad + (1 - (v - lo) / span) * (height - 2 * pad));
  const known = points.flatMap((p, i) => (p.value === null ? [] : [{ x: x(i), y: y(p.value) }]));
  // One entry has nothing to connect to, so it is drawn across the whole plot.
  const line = known.length === 1 ? [{ x: pad, y: known[0].y }, { x: w - pad, y: known[0].y }] : known;
  const path = line.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const ticks = !values.length ? [] : hi === lo ? [lo] : [hi, (hi + lo) / 2, lo];
  const grid = ticks.length ? ticks.map(y) : [pad, height / 2, height - pad];
  const fmt = (n: number) => String(Math.round(n * 100) / 100);
  return (
    <div className="line" role="img" aria-label={summary}>
      <div className="line-plot">
        <div className="line-y number-tabular" aria-hidden="true" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} style={{ top: y(t) }}>
              {fmt(t)}
            </span>
          ))}
        </div>
        <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }}>
          {grid.map((g) => (
            <line key={g} x1="0" x2={w} y1={g} y2={g} className="line-grid" vectorEffect="non-scaling-stroke" />
          ))}
          {path && <path d={path} className="line-path" vectorEffect="non-scaling-stroke" />}
        </svg>
      </div>
      <div className="line-axis" aria-hidden="true">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}
