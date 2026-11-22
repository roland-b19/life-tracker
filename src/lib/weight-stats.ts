import { addDays } from "./format-date";

/** Mean of the weigh-ins from today - 6 to today, to two decimals; null without one. */
export function sevenDayAverage(entries: { date: string; kilograms: number }[], today: string): number | null {
  const recent = entries.filter((e) => e.date >= addDays(today, -6) && e.date <= today).map((e) => e.kilograms);
  if (!recent.length) return null;
  return Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 100) / 100;
}
