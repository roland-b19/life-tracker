import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { msToNextDay, watchDay } from "../app/components/day-watch";

const HOUR = 60 * 60_000;

describe("msToNextDay", () => {
  it("counts to 00:00 in Bucharest, not on the device", () => {
    // 23:00 in Bucharest (UTC+2 in winter)
    expect(msToNextDay(new Date("2026-11-20T21:00:00Z"))).toBe(HOUR);
    // 01:00 in Bucharest: 23 hours to go
    expect(msToNextDay(new Date("2026-11-20T23:00:00Z"))).toBe(23 * HOUR);
  });
  it("follows the clock changes", () => {
    // Summer (UTC+3): midnight is 21:00 UTC; 25 October 2026 is the night the clocks go back
    expect(msToNextDay(new Date("2026-10-24T20:00:00Z"))).toBe(HOUR);
    // 29 March 2026 is the night the clocks go forward: midnight before it is still 22:00 UTC
    expect(msToNextDay(new Date("2026-03-28T21:30:00Z"))).toBe(HOUR / 2);
  });
});

describe("watchDay [MIDNIGHT]", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 23:59:30 in Bucharest
    vi.setSystemTime(new Date("2026-11-20T21:59:30Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes once when the day turns, and again the next night", () => {
    const refresh = vi.fn();
    const watch = watchDay(refresh);
    vi.advanceTimersByTime(25_000);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(12 * HOUR);
    watch.check();
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(12 * HOUR);
    expect(refresh).toHaveBeenCalledTimes(2);
    watch.stop();
  });

  it("catches a missed midnight on the focus check, once", () => {
    const refresh = vi.fn();
    const watch = watchDay(refresh);
    watch.stop(); // a device asleep: the timer never ran
    vi.setSystemTime(new Date("2026-11-21T06:00:00Z"));
    watch.check();
    watch.check();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh again after a refresh that already showed the new day", () => {
    const refresh = vi.fn();
    const watch = watchDay(refresh);
    watch.stop();
    vi.setSystemTime(new Date("2026-11-21T06:00:00Z"));
    watch.seen();
    watch.check();
    expect(refresh).not.toHaveBeenCalled();
  });
});
