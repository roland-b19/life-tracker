"use client";

import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useAnimatedNumber } from "./animated-number";

/** Small dependency-free chart primitives. Every chart has a text summary for screen readers. */

/** Categorical colors tuned to the Storm palette (steel blue first). */
export const CHART_COLORS = ["#86b4ea", "#8fd4a3", "#ebc673", "#c5a3e8", "#ef8f8f", "#7fd1d9", "#e8a77c", "#a6b0bd"];

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
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-text number-tabular">{Math.round(shown)}%</span>
    </div>
  );
}

export interface BarDatum {
  label: string;
  /** Bar height as a share of `max`. */
  value: number;
  /** Tooltip / screen reader text. */
  title: string;
  highlight?: boolean;
  empty?: boolean;
}

export function BarChart({
  data,
  max = 100,
  height = 140,
  summary,
  onSelect,
}: {
  data: BarDatum[];
  max?: number;
  height?: number;
  summary: string;
  /** Makes every bar a button (e.g. open that day). */
  onSelect?: (index: number) => void;
}) {
  const gap = data.length > 45 ? 1 : data.length > 20 ? 2 : 4;
  const style = { "--gap": `${gap}px` } as CSSProperties;
  return (
    <div className="bars" role={onSelect ? "group" : "img"} aria-label={summary} style={style}>
      <div className="bars-plot" style={{ height }}>
        {data.map((d, i) => {
          const bar = (
            <div
              className={`bars-bar${d.highlight ? " hl" : ""}${d.empty ? " empty" : ""}`}
              style={{
                height: d.empty ? 3 : `${Math.max(2, Math.min(100, (d.value / max) * 100))}%`,
                animationDelay: `${Math.min(i * 14, 420)}ms`,
              }}
            />
          );
          return onSelect ? (
            <button
              key={i}
              type="button"
              className="bars-col"
              title={d.title}
              aria-label={d.title}
              aria-pressed={d.highlight}
              onClick={() => onSelect(i)}
            >
              {bar}
            </button>
          ) : (
            <div key={i} className="bars-col" title={d.title}>
              {bar}
            </div>
          );
        })}
      </div>
      <div className="bars-labels" aria-hidden="true">
        {data.map((d, i) => (
          <span key={i}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

export interface Slice {
  label: string;
  value: number;
  display: string;
}

/** Donut chart with a legend; slice colors come from CHART_COLORS in order. */
export function DonutChart({
  slices,
  center,
  centerLabel,
  summary,
  size = 168,
}: {
  slices: Slice[];
  center: ReactNode;
  centerLabel: string;
  summary: string;
  size?: number;
}) {
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((n, s) => n + s.value, 0);
  const grow = useAnimatedNumber(1, 0, 900);
  // The slice under the pointer (or the legend row) comes forward; the centre shows its share.
  const [active, setActive] = useState<number | null>(null);
  const shown = active === null ? null : slices[active];
  // A touch "leaves" right after the tap, so a tapped slice stays chosen until another tap.
  const clear = (e: PointerEvent) => e.pointerType !== "touch" && setActive(null);
  const pick = (i: number) => ({ onPointerEnter: () => setActive(i), onClick: () => setActive((a) => (a === i ? null : i)) });
  let offset = 0;
  return (
    <div className="donut" data-active={active === null ? undefined : ""}>
      <div className="donut-chart" style={{ width: size, height: size }} role="img" aria-label={summary} onPointerLeave={clear}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={stroke} />
          {total > 0 &&
            slices.map((s, i) => {
              const len = (s.value / total) * c * grow;
              // A hairline gap between slices, like Apple's charts.
              const dash = Math.max(0, len - (slices.length > 1 ? 2 : 0));
              const el = (
                <circle
                  key={s.label}
                  className={`donut-slice${i === active ? " on" : ""}`}
                  {...pick(i)}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        {/* Keyed so the centre fades between the total and a slice */}
        <div className="donut-center" key={shown?.label ?? "total"}>
          <strong className="number-tabular">{shown ? shown.display : center}</strong>
          <span className="donut-center-label">{shown ? shown.label : centerLabel}</span>
          {shown && <span className="number-tabular">{Math.round((shown.value / total) * 100)}% of total</span>}
        </div>
      </div>
      <ul className="donut-legend" onPointerLeave={clear}>
        {slices.map((s, i) => (
          <li key={s.label} className={i === active ? "on" : undefined} {...pick(i)}>
            <span className="donut-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="donut-label">{s.label}</span>
            <span className="number-tabular">{s.display}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface HBarRow {
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

export function LineChart({
  points,
  summary,
  height = 140,
}: {
  points: { label: string; value: number }[];
  summary: string;
  height?: number;
}) {
  if (points.length < 2) return null;
  const w = 600;
  const pad = 8;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - 2 * pad);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (height - 2 * pad);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  return (
    <div className="line" role="img" aria-label={summary}>
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height }}>
        <path d={path} className="line-path" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} className="line-dot">
            <title>{`${p.label}: ${p.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="line-axis" aria-hidden="true">
        <span>{points[0].label}</span>
        <span className="number-tabular">
          {lo} – {hi}
        </span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}
