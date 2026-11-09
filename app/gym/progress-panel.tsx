"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart } from "../components/charts";
import { DatePicker } from "../components/date-picker";
import { Segmented } from "../components/segmented";
import { useToast } from "../components/toast";
import { getGymHistoryAction } from "@/app/actions/gym";
import { addDays, formatDMY, toISODate } from "@/lib/format-date";
import { dayProgress, exerciseSeries } from "@/lib/gym-progress";
import type { HistorySet } from "@/lib/gym";

type Range = "30" | "90" | "180" | "360";
const RANGES: { value: Range; label: string }[] = (["30", "90", "180", "360"] as const).map((d) => ({ value: d, label: `${d}D` }));
type Metric = "weight" | "reps";
const METRICS: { value: Metric; label: string }[] = [
  { value: "weight", label: "Weight" },
  { value: "reps", label: "Reps" },
];

const dm = (iso: string) => iso.slice(5).split("-").reverse().join(".");
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const pct = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${round(n)}%`);

export function ProgressPanel({ days }: { days: { id: string; name: string }[] }) {
  const { showToast } = useToast();
  const today = toISODate();
  const [sets, setSets] = useState<HistorySet[] | null>(null);
  const [exerciseId, setExerciseId] = useState("");
  const [metric, setMetric] = useState<Metric>("weight");
  const [range, setRange] = useState<Range>("90");
  const [dayId, setDayId] = useState(days[0]?.id ?? "");
  const [date, setDate] = useState(today);

  useEffect(() => {
    let active = true;
    getGymHistoryAction()
      .then((res) => active && setSets(res.sets))
      .catch(() => {
        if (!active) return;
        setSets([]);
        showToast({ message: "Failed to load progress", type: "warning" });
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  const exercises = useMemo(() => {
    const names = new Map<string, string>();
    for (const s of sets ?? []) names.set(s.exerciseId, s.exerciseName);
    return [...names].sort((a, b) => a[1].localeCompare(b[1]));
  }, [sets]);
  const loggedDates = useMemo(() => [...new Set((sets ?? []).map((s) => s.date))], [sets]);

  if (!sets) {
    return (
      <section className="surface" aria-busy="true">
        <div className="entries">
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
        </div>
      </section>
    );
  }
  if (!sets.length) {
    return (
      <section className="surface">
        <p className="empty-note">Log a workout to see your progress.</p>
      </section>
    );
  }

  const chosen = exercises.some(([id]) => id === exerciseId) ? exerciseId : exercises[0][0];
  const since = addDays(today, 1 - Number(range));
  const series = exerciseSeries(sets, chosen).filter((p) => p.date >= since);
  const unit = metric === "weight" ? "kg or plates" : "reps";

  const weeks = dayProgress(sets, dayId).slice(-8);
  const current = weeks.at(-1);
  const sameDay = sets.filter((s) => s.date === date);
  const sessionsOnDay = [...new Set(sameDay.map((s) => s.sessionId))];

  return (
    <div className="dashboard-grid gym-progress">
      <div className="dashboard-main">
        <section className="surface" aria-labelledby="ex-progress-title">
          <div className="section-head">
            <h2 id="ex-progress-title" className="section-title">
              Exercise progress
            </h2>
          </div>
          <label>
            Exercise
            <select value={chosen} onChange={(e) => setExerciseId(e.target.value)}>
              {exercises.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div className="chart-controls">
            <Segmented label="Metric" value={metric} options={METRICS} onChange={setMetric} />
            <Segmented label="Chart period" value={range} options={RANGES} onChange={setRange} />
          </div>
          <LineChart
            points={series.map((p) => ({ label: dm(p.date), value: p[metric] }))}
            summary={`Best ${metric} per workout over the last ${range} days`}
          />
          {series.length < 2 && <p className="muted chart-note">Not enough workouts in the last {range} days.</p>}
          {series.length > 0 && (
            <p className="muted chart-caption">
              Best {unit} of each workout; deload sessions are left out.
            </p>
          )}
        </section>

        <section className="surface" aria-labelledby="day-progress-title">
          <div className="section-head">
            <h2 id="day-progress-title" className="section-title">
              Workout days
            </h2>
            {current && <span className="badge badge-rest number-tabular">{pct(current.weight)} weight this week</span>}
          </div>
          {days.length > 0 && (
            <label>
              Day
              <select value={dayId} onChange={(e) => setDayId(e.target.value)}>
                {days.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="stat-row">
            <div className="stat-tile">
              <strong className="number-tabular">{pct(current?.weight ?? null)}</strong>
              <span>Weight vs last week</span>
            </div>
            <div className="stat-tile">
              <strong className="number-tabular">{pct(current?.reps ?? null)}</strong>
              <span>Reps vs last week</span>
            </div>
          </div>
          <LineChart
            points={weeks.filter((w) => w.weight !== null).map((w) => ({ label: dm(w.week), value: round(w.weight!) }))}
            summary="Average weekly change in best weight across the day's exercises, in percent"
          />
          <p className="muted chart-caption">
            Average change of each exercise&apos;s best weight from the week before (%), per week starting Monday.
          </p>
        </section>
      </div>

      <div className="dashboard-aside">
        <section className="surface" aria-labelledby="gym-history-title">
          <div className="section-head">
            <h2 id="gym-history-title" className="section-title">
              Logged workouts
            </h2>
            <span className="muted number-tabular">{loggedDates.length} days</span>
          </div>
          <div className="field">
            <span id="gym-history-date">Date</span>
            <DatePicker
              mode="day"
              className="date-field"
              value={date}
              today={today}
              max={today}
              marked={loggedDates}
              label={formatDMY(date)}
              labelledBy="gym-history-date"
              onChange={setDate}
            />
          </div>
          {sameDay.length === 0 ? (
            <p className="empty-note">No workout logged on this day.</p>
          ) : (
            sessionsOnDay.map((sid) => {
              const rows = sameDay.filter((s) => s.sessionId === sid);
              const names = [...new Map(rows.map((r) => [r.exerciseId, r.exerciseName]))];
              return (
                <div key={sid} className="history-session">
                  <h3 className="exercise-title">
                    {rows[0].dayName ?? "Workout"}
                    {rows[0].isDeload ? " · Deload" : ""}
                  </h3>
                  {names.map(([id, name]) => (
                    <p key={id} className="history-exercise">
                      <strong>{name}</strong>
                      <span className="muted number-tabular">
                        {rows
                          .filter((r) => r.exerciseId === id)
                          .map((r) => `${r.reps}×${round(r.load, 2)}`)
                          .join("  ")}
                      </span>
                    </p>
                  ))}
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
