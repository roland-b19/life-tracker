import { describe, expect, it } from "vitest";
import { weekStart as weekStartOf } from "@/lib/format-date";
import { sevenDayAverage } from "@/lib/weight-stats";

// 2026-11-08 is a Sunday.
const e = (date: string, kilograms: number) => ({ date, kilograms });

describe("weeks", () => {
  it("start on Sunday", () => {
    expect(weekStartOf("2026-11-08")).toBe("2026-11-08");
    expect(weekStartOf("2026-11-10")).toBe("2026-11-08");
    expect(weekStartOf("2026-11-07")).toBe("2026-11-01");
  });
});

describe("sevenDayAverage", () => {
  it("is null without weigh-ins in the last seven days", () => {
    expect(sevenDayAverage([], "2026-11-10")).toBeNull();
    expect(sevenDayAverage([e("2026-11-03", 90)], "2026-11-10")).toBeNull(); // today - 7 is outside
  });

  it("averages today - 6 to today, to two decimals, ignoring later days", () => {
    const entries = [e("2026-11-03", 90), e("2026-11-04", 81), e("2026-11-10", 79.333), e("2026-11-11", 50)];
    expect(sevenDayAverage(entries, "2026-11-10")).toBe(80.17); // (81 + 79.333) / 2
  });
});

describe("saveWeightSchema", () => {
  it("accepts two decimals that float math would reject (78.4, 80.1) and refuses three", async () => {
    const { saveWeightSchema } = await import("@/lib/validations/food");
    const id = crypto.randomUUID();
    for (const kilograms of [78.4, 80.1, 72.35]) expect(saveWeightSchema.safeParse({ id, date: "2026-11-11", kilograms }).success).toBe(true);
    expect(saveWeightSchema.safeParse({ id, date: "2026-11-11", kilograms: 78.123 }).success).toBe(false);
  });

  it("refuses a future day, accepts today", async () => {
    const { saveWeightSchema } = await import("@/lib/validations/food");
    const { addDays, toISODate } = await import("@/lib/format-date");
    const id = crypto.randomUUID();
    expect(saveWeightSchema.safeParse({ id, date: toISODate(), kilograms: 80 }).success).toBe(true);
    expect(saveWeightSchema.safeParse({ id, date: addDays(toISODate(), 1), kilograms: 80 }).success).toBe(false);
  });
});
