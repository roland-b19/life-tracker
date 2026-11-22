"use client";

import { useState } from "react";
import { ChartControls } from "../components/blocks";
import { LineChart } from "../components/charts";
import { Segmented } from "../components/segmented";
import { addDays, formatDM } from "@/lib/format-date";

/**
 * The simple line chart of a card (Weight): `days` are the periods offered, the window ends `today`, the server's day,
 * so the server's and the browser's first render match and the window moves with the page's refresh at midnight.
 */
export function TrendChart({
  noun,
  days,
  today,
  entries,
}: {
  noun: string;
  days: readonly number[];
  today: string;
  entries: { date: string; value: number }[];
}) {
  const [range, setRange] = useState(String(days[0]));
  const byDate = new Map(entries.map((e) => [e.date, e.value]));
  // Every day of the window is on the axis, so a few entries still make a chart.
  const points = Array.from({ length: Number(range) }, (_, i) => {
    const date = addDays(today, i + 1 - Number(range));
    return { label: formatDM(date), value: byDate.get(date) ?? null };
  });
  return (
    <>
      <ChartControls>
        <Segmented label="Chart period" value={range} options={days.map((d) => ({ value: String(d), label: `${d}D` }))} onChange={setRange} />
      </ChartControls>
      <LineChart points={points} summary={`${noun} over the last ${range} days`} />
    </>
  );
}
