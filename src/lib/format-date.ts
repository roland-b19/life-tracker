/** "2026-11-04" -> "04.11.2026" (d.m.y, the display format used across the app). */
export function formatDMY(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** "2026-11-04" -> "04.11" (d.m, a chart's day label). */
export function formatDM(iso: string): string {
  return formatDMY(iso).slice(0, 5);
}

// "Today" is the user's calendar day, not the server's: Vercel and the Azure container run in UTC.
export const APP_TZ = "Europe/Bucharest";
const todayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** The calendar day of a moment, in the app's timezone. */
export const appDay = (d: Date) => todayFormat.format(d);

/** "YYYY-MM-DD": today in Europe/Bucharest. */
export const toISODate = () => appDay(new Date());

/** "HH:MM": the clock time of a moment (now by default), in the app's timezone. */
export const appTime = (d: Date = new Date()) => timeFormat.format(d);

/** "2026-11-06" + n days, timezone-proof (pure calendar math in UTC). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The weekday of an ISO date, 0 (Sunday) to 6 (Saturday): pure calendar math, so the device's zone never matters. */
export const weekday = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();

/** The Sunday that starts the week of an ISO date: the user's week runs Sunday to Saturday. */
export function weekStart(iso: string): string {
  return addDays(iso, -weekday(iso));
}
