/** "2026-11-04" -> "04.11.2026" (d.m.y, the display format used across the app). */
export function formatDMY(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

// "Today" is the user's calendar day, not the server's: Vercel and the Azure container run in UTC.
export const APP_TZ = "Europe/Bucharest";
const todayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ });

/** The calendar day of a moment, in the app's timezone. */
export const appDay = (d: Date) => todayFormat.format(d);

/** "YYYY-MM-DD": today in Europe/Bucharest with no argument, otherwise the local calendar date of `d`. */
export function toISODate(d?: Date): string {
  if (!d) return todayFormat.format(new Date());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-11-06" + n days, timezone-proof (pure calendar math in UTC). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Sunday that starts the week of an ISO date: the user's week runs Sunday to Saturday. */
export function weekStart(iso: string): string {
  return addDays(iso, -new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay());
}
