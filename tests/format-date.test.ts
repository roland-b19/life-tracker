import { afterEach, describe, expect, it, vi } from "vitest";
import { toISODate } from "@/lib/format-date";

afterEach(() => vi.useRealTimers());

const at = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  return toISODate();
};

describe("toISODate() is the Europe/Bucharest calendar day", () => {
  it("turns over at local midnight in winter (UTC+2) and summer (UTC+3)", () => {
    expect(at("2026-11-10T21:59:59Z")).toBe("2026-11-10");
    expect(at("2026-11-10T22:00:00Z")).toBe("2026-11-11");
    expect(at("2026-07-10T20:59:59Z")).toBe("2026-07-10");
    expect(at("2026-07-10T21:00:00Z")).toBe("2026-07-11");
  });

  it("follows both daylight-saving changes", () => {
    expect(at("2026-03-28T21:59:59Z")).toBe("2026-03-28");
    expect(at("2026-03-28T22:00:00Z")).toBe("2026-03-29");
    expect(at("2026-10-24T20:59:59Z")).toBe("2026-10-24");
    expect(at("2026-10-24T21:00:00Z")).toBe("2026-10-25");
  });

  it("keeps the local calendar date of an explicit Date", () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
