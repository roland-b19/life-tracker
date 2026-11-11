"use client";

import { useState } from "react";
import { Card, ChartControls } from "../components/blocks";
import { LineChart } from "../components/charts";
import { Segmented } from "../components/segmented";
import { addDays, toISODate } from "@/lib/format-date";

/** The simple line chart under a Trend card (Water, Weight, Steps): `days` are the periods offered, the window ends today. */
export function TrendChart({
  id,
  noun,
  days,
  entries,
}: {
  id: string;
  noun: string;
  days: readonly number[];
  entries: { date: string; value: number }[];
}) {
  const [range, setRange] = useState(String(days[0]));
  const today = toISODate();
  const byDate = new Map(entries.map((e) => [e.date, e.value]));
  // Every day of the window is on the axis, so a few entries still make a chart.
  const points = Array.from({ length: Number(range) }, (_, i) => {
    const date = addDays(today, i + 1 - Number(range));
    return { label: date.slice(5).split("-").reverse().join("."), value: byDate.get(date) ?? null };
  });
  return (
    <Card id={id} title="Chart">
      <ChartControls>
        <Segmented label="Chart period" value={range} options={days.map((d) => ({ value: String(d), label: `${d}D` }))} onChange={setRange} />
      </ChartControls>
      <LineChart points={points} summary={`${noun} over the last ${range} days`} />
    </Card>
  );
}
