import { addDays } from "./format-date";
import type { HistorySet } from "./gym";

/** Monday of the week a date falls in. */
export function weekStart(date: string): string {
  const monday0 = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -monday0);
}

/** An exercise's best of each training day: the heaviest load and the most reps. Deload sessions are left out. */
export function exerciseSeries(sets: HistorySet[], exerciseId: string) {
  const byDate = new Map<string, { date: string; weight: number; reps: number }>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || s.isDeload) continue;
    const best = byDate.get(s.date) ?? { date: s.date, weight: 0, reps: 0 };
    best.weight = Math.max(best.weight, s.load);
    best.reps = Math.max(best.reps, s.reps);
    byDate.set(s.date, best);
  }
  return [...byDate.values()]; // sets arrive oldest first
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * How a workout day progressed week over week: for each week, the average over the day's exercises of the
 * percentage change of their best weight (and of their best reps) from the week before. An exercise only counts in
 * a week when it was also done the week before (with a load or reps above 0 to compare against).
 */
export function dayProgress(sets: HistorySet[], dayId: string) {
  const perExercise = new Map<string, Map<string, { weight: number; reps: number }>>();
  for (const s of sets) {
    if (s.dayId !== dayId || s.isDeload) continue;
    const weeks = perExercise.get(s.exerciseId) ?? new Map();
    const w = weekStart(s.date);
    const best = weeks.get(w) ?? { weight: 0, reps: 0 };
    best.weight = Math.max(best.weight, s.load);
    best.reps = Math.max(best.reps, s.reps);
    weeks.set(w, best);
    perExercise.set(s.exerciseId, weeks);
  }
  const allWeeks = [...new Set([...perExercise.values()].flatMap((m) => [...m.keys()]))].sort();
  return allWeeks.map((week) => {
    const before = addDays(week, -7);
    const changes = { weight: [] as number[], reps: [] as number[] };
    for (const weeks of perExercise.values()) {
      const now = weeks.get(week);
      const prev = weeks.get(before);
      if (!now || !prev) continue;
      if (prev.weight > 0) changes.weight.push(((now.weight - prev.weight) / prev.weight) * 100);
      if (prev.reps > 0) changes.reps.push(((now.reps - prev.reps) / prev.reps) * 100);
    }
    return { week, weight: mean(changes.weight), reps: mean(changes.reps) };
  });
}
