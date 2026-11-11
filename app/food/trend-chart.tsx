"use client";

import { useState } from "react";
import { Card, ChartControls, ChartNote } from "../components/blocks";
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
  const [range, setRange] = useState(String(days.includes(30) ? 30 : days[0]));
  const since = addDays(toISODate(), 1 - Number(range));
  const inRange = entries.filter((e) => e.date >= since).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Card id={id} title="Chart">
      <ChartControls>
        <Segmented label="Chart period" value={range} options={days.map((d) => ({ value: String(d), label: `${d}D` }))} onChange={setRange} />
      </ChartControls>
      <LineChart
        points={inRange.map((e) => ({ label: e.date.slice(5).split("-").reverse().join("."), value: e.value }))}
        summary={`${noun} over the last ${range} days`}
      />
      {inRange.length < 2 && <ChartNote>Not enough entries in the last {range} days.</ChartNote>}
    </Card>
  );
}
