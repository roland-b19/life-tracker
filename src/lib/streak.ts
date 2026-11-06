import { addDays } from "./format-date";

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
 * A repeating task's streak as seen on `day`: the run of ticked due days ending on `day`, or on
 * the due day before it while `day` is not ticked yet. Shared by the server and the optimistic UI.
 * A streak counts due days, so a Monday and Thursday task keeps it from Monday to Thursday.
 */
export function streakOn(done: ReadonlySet<string>, pattern: string | undefined, day: string): number {
  let d = done.has(day) ? day : previousDue(pattern, day);
  let n = 0;
  while (done.has(d)) {
    n++;
    d = previousDue(pattern, d);
  }
  return n;
}
