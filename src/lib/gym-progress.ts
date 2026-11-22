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

/** "1 plate = X kg" of each exercise that has one (D-038): exercise id → kg. */
export type PlateWeights = Record<string, number>;

/** What the progress figures need besides the sets (D-038): the plate weights, and the deload weeks they leave out. */
export interface ProgressRules {
  plates: PlateWeights;
  /** Deload weeks, as the Sunday that starts each (`deloadWeeksIn`). */
  deload: Set<string>;
}

/**
 * The deload weeks the progress figures leave out whole (D-038), as the Sunday that starts each: the weeks the user
 * chose, and the week of any workout started as a deload.
 */
export function deloadWeeksIn(chosen: string[], sets: HistorySet[]): Set<string> {
  return new Set([...chosen, ...sets.filter((s) => s.isDeload).map((s) => weekStart(s.date))]);
}

const inDeloadWeek = (date: string, deload: Set<string>) => deload.has(weekStart(date));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A set's kg for the progress figures, or null when it has none (D-038): a plate set counts once its exercise has a
 * plate weight, a bodyweight set by the kg it adds, and only when it adds some.
 */
export function setKg(s: Pick<HistorySet, "exerciseId" | "loadType" | "load">, plates: PlateWeights): number | null {
  if (s.loadType === "plates") return plates[s.exerciseId] ? round2(s.load * plates[s.exerciseId]) : null;
  if (s.loadType === "bodyweight") return s.load > 0 ? s.load : null;
  return s.load;
}

/**
 * The unit an exercise is charted in: the one of its latest set outside deload weeks, so a change of unit never plots
 * plates against kg; null when it was only done in deload weeks.
 */
export function exerciseUnit(sets: HistorySet[], exerciseId: string, deload: Set<string>) {
  // sets arrive oldest first
  return [...sets].reverse().find((s) => s.exerciseId === exerciseId && !inDeloadWeek(s.date, deload))?.loadType ?? null;
}

/** What an exercise's chart shows: kg, plates (no plate weight yet), or a bodyweight exercise's reps or added kg. */
export type Measure = "kg" | "plates" | "reps" | "added";

/**
 * What an exercise's chart measures (D-038): a bodyweight exercise its reps or its added kg (`bodyweight`, the
 * chart's switch), a plate exercise with no plate weight its plates, any other its kg (plate sets in kg). Null when it
 * was only done in deload weeks.
 */
export function exerciseMeasure(sets: HistorySet[], exerciseId: string, { plates, deload }: ProgressRules, bodyweight: "reps" | "added"): Measure | null {
  const unit = exerciseUnit(sets, exerciseId, deload);
  if (unit === null) return null;
  if (unit === "bodyweight") return bodyweight;
  return unit === "plates" && !plates[exerciseId] ? "plates" : "kg";
}

function measured(s: HistorySet, measure: Measure, plates: PlateWeights): number | null {
  if (measure === "reps") return s.loadType === "bodyweight" ? s.reps : null;
  if (measure === "added") return s.loadType === "bodyweight" && s.load > 0 ? s.load : null;
  if (measure === "plates") return s.loadType === "plates" ? s.load : null;
  return s.loadType === "bodyweight" ? null : setKg(s, plates);
}

/** An exercise's best of each training day in `measure` (`exerciseMeasure`), oldest first. Deload weeks are left out whole. */
export function exerciseSeries(sets: HistorySet[], exerciseId: string, measure: Measure, { plates, deload }: ProgressRules) {
  const byDate = new Map<string, number>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || inDeloadWeek(s.date, deload)) continue;
    const value = measured(s, measure, plates);
    if (value !== null) byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, value));
  }
  return [...byDate].map(([date, value]) => ({ date, value })); // sets arrive oldest first
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * How a workout day progressed week over week (D-038): for each week, the average over the day's exercises of the
 * change in their best kg (`setKg`) from the week before. An exercise only counts in a week when it was also done the
 * week before. Deload weeks are left out whole: the week after one compares with the week before it.
 */
export function dayProgress(sets: HistorySet[], dayId: string, { plates, deload }: ProgressRules) {
  const perExercise = new Map<string, Map<string, number>>();
  for (const s of sets) {
    const kg = setKg(s, plates);
    if (s.dayId !== dayId || kg === null || inDeloadWeek(s.date, deload)) continue;
    const weeks = perExercise.get(s.exerciseId) ?? new Map();
    const w = weekStart(s.date);
    weeks.set(w, Math.max(weeks.get(w) ?? 0, kg));
    perExercise.set(s.exerciseId, weeks);
  }
  const allWeeks = [...new Set([...perExercise.values()].flatMap((m) => [...m.keys()]))].sort();
  return allWeeks.map((week) => {
    let before = addDays(week, -7);
    while (deload.has(before)) before = addDays(before, -7);
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
 * exercises, `dayProgress`), or null when there is nothing to compare: no day, or no earlier week. A workout in a
 * deload week is never compared (`deloadWeek`).
 */
export type HistoryEntry = HistorySession & { progress: number | null; deloadWeek: boolean };

export function withProgress(sessions: HistorySession[], sets: HistorySet[], rules: ProgressRules): HistoryEntry[] {
  const byDay = new Map<string, ReturnType<typeof dayProgress>>();
  return sessions.map((s) => {
    const deloadWeek = inDeloadWeek(s.date, rules.deload);
    if (!s.dayId || deloadWeek) return { ...s, progress: null, deloadWeek };
    let weeks = byDay.get(s.dayId);
    if (!weeks) byDay.set(s.dayId, (weeks = dayProgress(sets, s.dayId, rules)));
    return { ...s, progress: weeks.find((x) => x.week === weekStart(s.date))?.change ?? null, deloadWeek };
  });
}
