import { addDays } from "./format-date";
import type { HistorySession, HistorySet } from "./gym";

/** Monday of the week a date falls in. */
export function weekStart(date: string): string {
  const monday0 = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -monday0);
}

/** Mondays of the weeks that hold a deload session: easier training, so the whole week stays out of every figure. */
function deloadWeeks(sets: HistorySet[]) {
  return new Set(sets.filter((s) => s.isDeload).map((s) => weekStart(s.date)));
}

/** An exercise's heaviest load of each training day. Deload weeks are left out. */
export function exerciseSeries(sets: HistorySet[], exerciseId: string) {
  const skip = deloadWeeks(sets);
  const byDate = new Map<string, { date: string; weight: number }>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || skip.has(weekStart(s.date))) continue;
    const best = byDate.get(s.date) ?? { date: s.date, weight: 0 };
    best.weight = Math.max(best.weight, s.load);
    byDate.set(s.date, best);
  }
  return [...byDate.values()]; // sets arrive oldest first
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * How a workout day progressed week over week: for each week, the average over the day's exercises of the change in
 * their best weight (kg) from the week before. An exercise only counts in a week when it was also done the week
 * before. Deload weeks are skipped: they are neither a point nor a baseline, so the week after one is compared with
 * the week before it.
 */
export function dayProgress(sets: HistorySet[], dayId: string) {
  const skip = deloadWeeks(sets);
  const perExercise = new Map<string, Map<string, number>>();
  for (const s of sets) {
    if (s.dayId !== dayId || skip.has(weekStart(s.date))) continue;
    const weeks = perExercise.get(s.exerciseId) ?? new Map();
    const w = weekStart(s.date);
    weeks.set(w, Math.max(weeks.get(w) ?? 0, s.load));
    perExercise.set(s.exerciseId, weeks);
  }
  const allWeeks = [...new Set([...perExercise.values()].flatMap((m) => [...m.keys()]))].sort();
  return allWeeks.map((week) => {
    let before = addDays(week, -7);
    while (skip.has(before)) before = addDays(before, -7);
    const changes: number[] = [];
    for (const weeks of perExercise.values()) {
      const now = weeks.get(week);
      const prev = weeks.get(before);
      if (now !== undefined && prev !== undefined) changes.push(now - prev);
    }
    return { week, change: mean(changes) };
  });
}

/** A weight change as the user reads it: "+2.5 kg", "−1 kg", "0 kg". */
export const kgDelta = (n: number | null) => {
  if (n === null) return "—";
  const r = Math.round(n * 100) / 100;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)} kg`;
};

/**
 * Each past workout with how its day did that week against the week before (the same figure as the Progress tab's
 * Workout days: the average kg change), or null when there is nothing to compare: a deload week, no day, or no
 * earlier week.
 */
export type HistoryEntry = HistorySession & { progress: number | null };

export function withProgress(sessions: HistorySession[], sets: HistorySet[]): HistoryEntry[] {
  const byDay = new Map<string, ReturnType<typeof dayProgress>>();
  return sessions.map((s) => {
    if (!s.dayId || s.isDeload) return { ...s, progress: null };
    let weeks = byDay.get(s.dayId);
    if (!weeks) byDay.set(s.dayId, (weeks = dayProgress(sets, s.dayId)));
    return { ...s, progress: weeks.find((x) => x.week === weekStart(s.date))?.change ?? null };
  });
}
