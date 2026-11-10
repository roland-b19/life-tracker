import { addDays } from "./format-date";

/**
 * A repeating task's streak as seen on `day`: the run of ticked days ending on `day`, or on
 * yesterday while `day` is not ticked yet. Shared by the server and the optimistic UI.
 */
export function streakOn(done: ReadonlySet<string>, day: string): number {
  let d = done.has(day) ? day : addDays(day, -1);
  let n = 0;
  while (done.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
