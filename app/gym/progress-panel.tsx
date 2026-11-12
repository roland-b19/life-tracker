"use client";

import { useMemo, useState } from "react";
import { Card, ChartCaption, ChartControls, ChartNote, EmptyNote, SelectField } from "../components/blocks";
import { LineChart } from "../components/charts";
import { Segmented } from "../components/segmented";
import { addDays, toISODate } from "@/lib/format-date";
import { exerciseSeries } from "@/lib/gym-progress";
import type { HistorySet } from "@/lib/gym";

type Range = "30" | "90" | "180" | "360";
const RANGES: { value: Range; label: string }[] = (["30", "90", "180", "360"] as const).map((d) => ({ value: d, label: `${d}D` }));

const dm = (iso: string) => iso.slice(5).split("-").reverse().join(".");

export function ProgressPanel({ sets }: { sets: HistorySet[] }) {
  const today = toISODate();
  const [exerciseId, setExerciseId] = useState("");
  const [range, setRange] = useState<Range>("90");

  const exercises = useMemo(() => {
    const names = new Map<string, string>();
    for (const s of sets) names.set(s.exerciseId, s.exerciseName);
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sets]);

  if (!sets.length) {
    return (
      <Card label="Progress" className="gym-progress">
        <EmptyNote>Log a workout to see your progress.</EmptyNote>
      </Card>
    );
  }

  const chosen = exercises.some(([id]) => id === exerciseId) ? exerciseId : exercises[0][0];
  const since = addDays(today, 1 - Number(range));
  const series = exerciseSeries(sets, chosen).filter((p) => p.date >= since);

  return (
    <Card id="ex-progress-title" title="Exercise progress" className="gym-progress">
      <SelectField
        label="Exercise"
        value={chosen}
        onChange={(e) => setExerciseId(e.target.value)}
        options={exercises.map(([id, name]) => ({ value: id, label: name }))}
      />
      <ChartControls>
        <Segmented label="Chart period" value={range} options={RANGES} onChange={setRange} />
      </ChartControls>
      <LineChart
        points={series.map((p) => ({ label: dm(p.date), value: p.weight }))}
        summary={`Best weight per workout over the last ${range} days`}
      />
      {series.length < 2 && <ChartNote>Not enough workouts in the last {range} days.</ChartNote>}
      {series.length > 0 && <ChartCaption>Heaviest load (kg or plates) of each workout; deload weeks are left out.</ChartCaption>}
    </Card>
  );
}
