import { addDays, appDay } from "@/lib/format-date";

/** Milliseconds from `now` to the next 00:00 in the app's time zone (Europe/Bucharest), whatever the device's zone. */
export function msToNextDay(now: Date): number {
  const tomorrow = addDays(appDay(now), 1);
  // The zone's midnight is within 14 hours of UTC midnight and on a quarter hour: walk there
  const step = 15 * 60_000;
  let t = Date.parse(`${tomorrow}T00:00:00Z`) - 14 * 60 * 60_000;
  while (appDay(new Date(t)) !== tomorrow) t += step;
  return t - now.getTime();
}

/**
 * Keeps the app's day an open page was shown on, and refreshes the page once when the day has changed: at a timer
 * for the next midnight, and on `check()` (focus). `seen()`: a refresh is already under way, so the day it shows is
 * today's. A device that slept through midnight missed the timer; the focus check catches it.
 */
export function watchDay(refresh: () => void) {
  let day = appDay(new Date());
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    clearTimeout(timer);
    // A second past midnight, so the server is surely on the new day too
    timer = setTimeout(() => {
      check();
      schedule();
    }, msToNextDay(new Date()) + 1000);
  };

  const seen = () => {
    day = appDay(new Date());
  };

  const check = () => {
    if (appDay(new Date()) === day) return;
    seen();
    refresh();
  };

  schedule();
  return { check, seen, stop: () => clearTimeout(timer) };
}
