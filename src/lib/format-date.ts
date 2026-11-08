/** "2026-11-04" -> "04.11.2026" (d.m.y, the display format used across the app). */
export function formatDMY(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** "2026-11-04" -> "Wed 04.11.2026". */
export const dayLabel = (iso: string, weekday: "short" | "long" = "short") =>
  `${new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday })} ${formatDMY(iso)}`;

/** Local "YYYY-MM-DD" for a Date (default: now). */
export function toISODate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "2026-11-06" + n days, timezone-proof (pure calendar math in UTC). */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
