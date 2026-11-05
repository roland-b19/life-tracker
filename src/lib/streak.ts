import { addDays } from "./format-date";

export interface StreakState {
  streak: number;
  lastCompletedDate: string | null;
}

/**
 * A daily task's streak after it is ticked (`done`) or unticked on `day`. Shared by the server
 * and the optimistic UI. Unticking gives back exactly what the tick added, so tick, untick,
 * tick again lands where it started.
 */
export function applyToggle(s: StreakState, done: boolean, day: string): StreakState {
  if (done) {
    // Already ticked on this day (a double click), or a later day: nothing to add.
    if (s.lastCompletedDate && s.lastCompletedDate >= day) return s;
    return { streak: s.lastCompletedDate === addDays(day, -1) ? s.streak + 1 : 1, lastCompletedDate: day };
  }
  if (s.lastCompletedDate !== day) return s; // not ticked on this day: nothing to take back
  const streak = Math.max(0, s.streak - 1);
  // A streak above 0 still ends yesterday; otherwise there was no run before today's tick.
  return { streak, lastCompletedDate: streak > 0 ? addDays(day, -1) : null };
}

/** The streak as seen on `day`: it is broken once a whole day passes without a tick. */
export function liveStreak(s: StreakState, day: string): number {
  return s.lastCompletedDate === day || s.lastCompletedDate === addDays(day, -1) ? s.streak : 0;
}
