import { afterEach, describe, expect, it, vi } from "vitest";
import { toISODate } from "@/lib/format-date";
import { cleanNumberInput, showDecimal } from "@/lib/decimal-input";

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
});

describe("cleanNumberInput", () => {
  it("takes a comma or a dot as the decimal separator and keeps only one", () => {
    expect(cleanNumberInput("72,5", false)).toBe("72.5");
    expect(cleanNumberInput("72.5.1", false)).toBe("72.51");
    expect(cleanNumberInput("7a2,,5", false)).toBe("72.5");
    expect(cleanNumberInput("-3-4", false)).toBe("-34");
    expect(showDecimal("72.5")).toBe("72,5");
  });
  it("keeps only digits in a whole-number field", () => {
    expect(cleanNumberInput("1,5", true)).toBe("1");
    expect(cleanNumberInput("250.5", true)).toBe("250");
    expect(cleanNumberInput("-2", true)).toBe("2");
  });
});
