/** "2026-11-04" -> "04.11.2026" (d.m.y, the display format used across the app). */
export function formatDMY(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}
