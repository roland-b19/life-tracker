import { addDays, weekStart } from "./format-date";
import type { HistorySession, HistorySet } from "./gym";

export { weekStart };

/** Whole calendar weeks (Sunday to Sunday) from one date's week to another's: negative when `to` is earlier. */
export function weeksBetween(from: string, to: string): number {
  const sunday = (d: string) => Date.parse(`${weekStart(d)}T00:00:00Z`);
  return Math.round((sunday(to) - sunday(from)) / (7 * 86_400_000));
}

/** The load a set counts as: plates and kg are different units, so extra kg is only added to a kg or bodyweight set. */
export const setLoad = (loadType: string, value: number | string, extra: number | string) =>
  loadType === "plates" ? Number(value) : Number(value) + Number(extra);

/** The unit an exercise is shown in: the one of its latest set, so a change of unit never plots plates against kg. */
export function exerciseUnit(sets: HistorySet[], exerciseId: string) {
  return [...sets].reverse().find((s) => s.exerciseId === exerciseId && !s.isDeload)?.loadType ?? "kg"; // sets arrive oldest first
}

/** An exercise's heaviest load of each training day, in its current unit. Sets of deload sessions are left out (only that session, not its week): only this chart ignores them. */
export function exerciseSeries(sets: HistorySet[], exerciseId: string) {
  const unit = exerciseUnit(sets, exerciseId);
  const byDate = new Map<string, { date: string; weight: number }>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || s.isDeload || s.loadType !== unit) continue;
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
 * before. Deload weeks count like any other week. Plates are not kg, so plate sets are left out.
 */
export function dayProgress(sets: HistorySet[], dayId: string) {
  const perExercise = new Map<string, Map<string, number>>();
  for (const s of sets) {
    if (s.dayId !== dayId || s.loadType === "plates") continue;
    const weeks = perExercise.get(s.exerciseId) ?? new Map();
    const w = weekStart(s.date);
    weeks.set(w, Math.max(weeks.get(w) ?? 0, s.load));
    perExercise.set(s.exerciseId, weeks);
  }
  const allWeeks = [...new Set([...perExercise.values()].flatMap((m) => [...m.keys()]))].sort();
  return allWeeks.map((week) => {
    const before = addDays(week, -7);
    const changes: number[] = [];
    for (const weeks of perExercise.values()) {
      const now = weeks.get(week);
      const prev = weeks.get(before);
      if (now !== undefined && prev !== undefined) changes.push(now - prev);
    }
    return { week, change: mean(changes) };
  });
}

type OpenWorkout = {
  id: string;
  date: string;
  isDeload: boolean;
  splitDayId?: string | null;
  splitDayName?: string | null;
  sets: { exerciseId: string; setOrder: number; reps: number; loadType: string; loadValue: string; extraKg: string }[];
};

/**
 * Every set the progress figures read, oldest first: the finished workouts the page already holds plus the open one,
 * so the Progress tab needs no second read of the same year of sets.
 */
export function progressSets(history: HistorySession[], open: OpenWorkout | null, names: Map<string, string>): HistorySet[] {
  const sets: HistorySet[] = history.flatMap((s) =>
    s.exercises.flatMap((e) =>
      e.sets.map((x, i) => ({ date: s.date, sessionId: s.id, isDeload: s.isDeload, dayId: s.dayId, dayName: s.dayName, exerciseId: e.id, exerciseName: e.name, setOrder: i + 1, ...x })),
    ),
  );
  if (open) {
    const { id: sessionId, date, isDeload } = open;
    const [dayId, dayName] = [open.splitDayId ?? null, open.splitDayName ?? null];
    for (const x of open.sets) {
      const { exerciseId, setOrder, reps, loadType } = x;
      const exerciseName = names.get(exerciseId) ?? "Exercise";
      sets.push({ date, sessionId, isDeload, dayId, dayName, exerciseId, exerciseName, setOrder, reps, loadType, load: setLoad(loadType, x.loadValue, x.extraKg) });
    }
  }
  return sets.sort((a, b) => a.date.localeCompare(b.date));
}

/** A weight change as the user reads it: "+2.5 kg", "−1 kg", "0 kg". */
export const kgDelta = (n: number | null) => {
  if (n === null) return "—";
  const r = Math.round(n * 100) / 100;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)} kg`;
};

/**
 * Each past workout with how its day did that week against the week before (the average kg change of its
 * exercises), or null when there is nothing to compare: no day, or no earlier week. Deload weeks count like any other.
 */
export type HistoryEntry = HistorySession & { progress: number | null };

export function withProgress(sessions: HistorySession[], sets: HistorySet[]): HistoryEntry[] {
  const byDay = new Map<string, ReturnType<typeof dayProgress>>();
  return sessions.map((s) => {
    if (!s.dayId) return { ...s, progress: null };
    let weeks = byDay.get(s.dayId);
    if (!weeks) byDay.set(s.dayId, (weeks = dayProgress(sets, s.dayId)));
    return { ...s, progress: weeks.find((x) => x.week === weekStart(s.date))?.change ?? null };
  });
}
