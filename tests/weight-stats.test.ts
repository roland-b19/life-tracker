import { describe, expect, it } from "vitest";
import { weekStart as weekStartOf } from "@/lib/format-date";
import { weightStats } from "@/lib/weight-stats";

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
      sinceLastWeek: null,
    });
  });

  it("compares this week so far with last week", () => {
    const stats = weightStats(
      [
        e("2026-10-25", 90), // week of 25.10: 90
        e("2026-11-01", 84), // week of 01.11: 84 (-6)
        e("2026-11-08", 81), // week of 08.11 so far: 80 (-4)
        e("2026-11-10", 79),
      ],
      "2026-11-10", // Tuesday
    );
    expect(stats.sinceLastWeek).toBe(-4);
    expect(stats.weekStartWeight).toBe(81);
    expect(stats.latestWeight).toBe(79);
    expect(stats.latestDate).toBe("2026-11-10");
    expect(stats.sevenDayAverage).toBe(80); // 04.11-10.11: 81, 79
  });

  it("skips a missing last week and starts the week at the first weigh-in after Sunday", () => {
    const stats = weightStats([e("2026-10-25", 90), e("2026-11-09", 88)], "2026-11-09");
    expect(stats.sinceLastWeek).toBeNull(); // nothing logged last week
    expect(stats.weekStartWeight).toBe(88);
  });
});

describe("weightInput", () => {
  it("accepts two decimals that float math would reject (78.4, 80.1) and refuses three", async () => {
    const { weightInput } = await import("@/lib/validations/weight");
    for (const kilograms of [78.4, 80.1, 72.35]) expect(weightInput.safeParse({ date: "2026-11-11", kilograms }).success).toBe(true);
    expect(weightInput.safeParse({ date: "2026-11-11", kilograms: 78.123 }).success).toBe(false);
  });

  it("refuses a future day, accepts today", async () => {
    const { weightInput } = await import("@/lib/validations/weight");
    const { addDays, toISODate } = await import("@/lib/format-date");
    expect(weightInput.safeParse({ date: toISODate(), kilograms: 80 }).success).toBe(true);
    expect(weightInput.safeParse({ date: addDays(toISODate(), 1), kilograms: 80 }).success).toBe(false);
  });
});
