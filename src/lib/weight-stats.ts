import { addDays } from "./format-date";

export type WeightStats = {
  latestWeight: number | null;
  latestDate: string | null;
  /** Mean of the weigh-ins from today - 6 to today. */
  sevenDayAverage: number | null;
  /** This week's Sunday weigh-in, else the first one since that Sunday. */
  weekStartWeight: number | null;
  /** This week's average so far minus last week's average. */
  sinceLastWeek: number | null;
};

const round = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** The Sunday that starts the week of an ISO date. */
export const weekStartOf = (iso: string) => addDays(iso, -day(iso).getUTCDay());

export function weightStats(entries: { date: string; kilograms: number }[], today: string): WeightStats {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const byWeek = new Map<string, number[]>();
  for (const e of sorted) {
    const week = weekStartOf(e.date);
    byWeek.set(week, [...(byWeek.get(week) ?? []), e.kilograms]);
  }
  const weekAvg = (week: string) => mean(byWeek.get(week) ?? []);
  const thisWeek = weekStartOf(today);
  const last = sorted.at(-1);

  const current = weekAvg(thisWeek);
  const previous = weekAvg(addDays(thisWeek, -7));
  const recent = mean(sorted.filter((e) => e.date >= addDays(today, -6) && e.date <= today).map((e) => e.kilograms));
  const weekStart = sorted.find((e) => e.date >= thisWeek && e.date <= today);

  return {
    latestWeight: last ? round(last.kilograms) : null,
    latestDate: last?.date ?? null,
    sevenDayAverage: recent === null ? null : round(recent),
    weekStartWeight: weekStart ? round(weekStart.kilograms) : null,
    sinceLastWeek: current === null || previous === null ? null : round(current - previous),
  };
}
