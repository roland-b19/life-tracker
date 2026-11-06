import { addDays } from "./format-date";

export interface StreakState {
  streak: number;
  lastCompletedDate: string | null;
  /** "daily", or "days:1,3,5" for chosen ISO weekdays; missing means daily. */
  recurrencePattern?: string;
}

/** ISO weekday of a YYYY-MM-DD day: 1 = Monday ... 7 = Sunday. */
export const weekdayOf = (iso: string) => ((new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** Whether a repeating task is due on `day`: every day, or only on its chosen weekdays. */
export function isDueOn(pattern: string | undefined, day: string): boolean {
  return !pattern?.startsWith("days:") || pattern.slice(5).split(",").includes(String(weekdayOf(day)));
}

/** The due day before `day`: yesterday for a daily task, the previous chosen weekday otherwise. */
export function previousDue(pattern: string | undefined, day: string): string {
  for (let i = 1; i <= 7; i++) if (isDueOn(pattern, addDays(day, -i))) return addDays(day, -i);
  return addDays(day, -1);
}

/**
 * A repeating task's streak after it is ticked (`done`) or unticked on `day`. Shared by the
 * server and the optimistic UI. Unticking gives back exactly what the tick added, so tick,
 * untick, tick again lands where it started. A streak counts due days, so a Monday and
 * Thursday task keeps it from Monday to Thursday.
 */
export function applyToggle(s: StreakState, done: boolean, day: string): StreakState {
  const before = previousDue(s.recurrencePattern, day);
  if (done) {
    // Already ticked on this day (a double click), or a later day: nothing to add.
    if (s.lastCompletedDate && s.lastCompletedDate >= day) return s;
    return { streak: s.lastCompletedDate === before ? s.streak + 1 : 1, lastCompletedDate: day };
  }
  if (s.lastCompletedDate !== day) return s; // not ticked on this day: nothing to take back
  const streak = Math.max(0, s.streak - 1);
  // A streak above 0 still ends on the previous due day; otherwise there was no run before this tick.
  return { streak, lastCompletedDate: streak > 0 ? before : null };
}

/** The streak as seen on `day`: it is broken once a due day passes without a tick. */
export function liveStreak(s: StreakState, day: string): number {
  return s.lastCompletedDate === day || s.lastCompletedDate === previousDue(s.recurrencePattern, day) ? s.streak : 0;
}
