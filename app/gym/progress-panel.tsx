"use client";

import { useMemo, useState } from "react";
import { Card, ChartCaption, ChartControls, ChartNote, Dashboard, EmptyNote, SelectField, StatRow } from "../components/blocks";
import { LineChart } from "../components/charts";
import { Segmented } from "../components/segmented";
import { addDays, toISODate } from "@/lib/format-date";
import { dayProgress, exerciseSeries, kgDelta } from "@/lib/gym-progress";
import type { HistorySet } from "@/lib/gym";

type Range = "30" | "90" | "180" | "360";
const RANGES: { value: Range; label: string }[] = (["30", "90", "180", "360"] as const).map((d) => ({ value: d, label: `${d}D` }));

const dm = (iso: string) => iso.slice(5).split("-").reverse().join(".");
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function ProgressPanel({ sets, days }: { sets: HistorySet[]; days: { id: string; name: string }[] }) {
  const today = toISODate();
  const [exerciseId, setExerciseId] = useState("");
  const [range, setRange] = useState<Range>("90");
  const [dayId, setDayId] = useState(days[0]?.id ?? "");

  const exercises = useMemo(() => {
    const names = new Map<string, string>();
    for (const s of sets) names.set(s.exerciseId, s.exerciseName);
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sets]);

  if (!sets.length) {
    return (
      <Card label="Progress">
        <EmptyNote>Log a workout to see your progress.</EmptyNote>
      </Card>
    );
  }

  const chosen = exercises.some(([id]) => id === exerciseId) ? exerciseId : exercises[0][0];
  const since = addDays(today, 1 - Number(range));
  const series = exerciseSeries(sets, chosen).filter((p) => p.date >= since);

  const weeks = dayProgress(sets, dayId).slice(-8);
  const current = weeks.at(-1);

  return (
    <Dashboard even className="gym-progress">
      <Card id="ex-progress-title" title="Exercise progress">
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

      <Card id="day-progress-title" title="Workout days">
        {days.length > 0 && (
          <SelectField label="Day" value={dayId} onChange={(e) => setDayId(e.target.value)} options={days.map((d) => ({ value: d.id, label: d.name }))} />
        )}
        <StatRow stats={[{ value: kgDelta(current?.change ?? null), label: "Weight vs last week" }]} />
        <LineChart
          points={weeks.filter((w) => w.change !== null).map((w) => ({ label: dm(w.week), value: round(w.change!, 2) }))}
          summary="Average weekly change in best weight across the day's exercises, in kg"
        />
        <ChartCaption>
          Average change of each exercise&apos;s best weight from the week before (kg), per week starting Monday.
          Deload weeks are skipped: the week after one is compared with the week before it.
        </ChartCaption>
      </Card>
    </Dashboard>
  );
}
