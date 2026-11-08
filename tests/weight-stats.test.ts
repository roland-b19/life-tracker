import { describe, expect, it } from "vitest";
import { weekStartOf, weightStats } from "@/lib/weight-stats";

// 2026-11-08 is a Sunday.
const e = (date: string, kilograms: number) => ({ date, kilograms });

describe("weightStats", () => {
  it("weeks start on Sunday", () => {
    expect(weekStartOf("2026-11-08")).toBe("2026-11-08");
    expect(weekStartOf("2026-11-10")).toBe("2026-11-08");
    expect(weekStartOf("2026-11-07")).toBe("2026-11-01");
  });

  it("returns nulls without weigh-ins", () => {
    expect(weightStats([], "2026-11-10")).toEqual({
      latestWeight: null,
      latestDate: null,
      sevenDayAverage: null,
      weekStartWeight: null,
      weeklyRate: null,
      sinceLastWeek: null,
    });
  });

  it("averages the week-to-week changes and compares this week so far with last week", () => {
    const stats = weightStats(
      [
        e("2026-10-25", 90), // week of 25.10: 90
        e("2026-11-01", 84), // week of 01.11: 84 (-6)
        e("2026-11-08", 81), // week of 08.11 so far: 80 (-4)
        e("2026-11-10", 79),
      ],
      "2026-11-10", // Tuesday
    );
    expect(stats.weeklyRate).toBe(-5);
    expect(stats.sinceLastWeek).toBe(-4);
    expect(stats.weekStartWeight).toBe(81);
    expect(stats.latestWeight).toBe(79);
    expect(stats.latestDate).toBe("2026-11-10");
    expect(stats.sevenDayAverage).toBe(80); // 04.11-10.11: 81, 79
  });

  it("spreads a change over skipped weeks and starts the week at the first weigh-in after Sunday", () => {
    const stats = weightStats([e("2026-10-25", 90), e("2026-11-09", 88)], "2026-11-09");
    expect(stats.weeklyRate).toBe(-1); // -2 over two weeks
    expect(stats.sinceLastWeek).toBeNull(); // nothing logged last week
    expect(stats.weekStartWeight).toBe(88);
  });
});
