import { afterEach, describe, expect, it, vi } from "vitest";
import { appTime, toISODate, weekday, weekStart } from "@/lib/format-date";
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

// A device far from Bucharest: Node follows a changed TZ at once, so the same instant reads differently on the device.
const DEVICE_ZONES = ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago"];

describe("the app's clock never follows the device's zone", () => {
  const savedTz = process.env.TZ;
  afterEach(() => {
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  });

  // 2026-11-13 is a Friday in Bucharest from 22:00Z on the 12th (00:00 UTC+2); one minute earlier it is still Thursday the 12th.
  it.each(DEVICE_ZONES)("weekday and time match Bucharest on a device in %s", (zone) => {
    process.env.TZ = zone;
    const nowIs = (iso: string) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(iso));
    };
    nowIs("2026-11-12T21:59:00Z");
    expect([toISODate(), weekday(toISODate()), appTime()]).toEqual(["2026-11-12", 4, "23:59"]);
    nowIs("2026-11-12T22:00:00Z");
    expect([toISODate(), weekday(toISODate()), appTime()]).toEqual(["2026-11-13", 5, "00:00"]);
    nowIs("2026-07-01T06:05:00Z"); // summer, UTC+3
    expect([toISODate(), weekday(toISODate()), appTime()]).toEqual(["2026-07-01", 3, "09:05"]);
  });

  it("appTime is always HH:MM, as the food chat's schema requires", () => {
    expect(appTime(new Date("2026-11-12T22:30:00Z"))).toBe("00:30");
    expect(appTime(new Date("2026-11-12T10:07:00Z"))).toBe("12:07");
  });

  it("weekday counts from Sunday and weekStart is the Sunday before", () => {
    expect(weekday("2026-11-15")).toBe(0);
    expect(weekday("2026-11-14")).toBe(6);
    expect(weekStart("2026-11-14")).toBe("2026-11-08");
    expect(weekStart("2026-11-15")).toBe("2026-11-15");
  });
});

// The device clock APIs below read the viewer's zone, not Europe/Bucharest. Use the helpers in src/lib/format-date.ts instead.
const sources = import.meta.glob(["../app/**/*.{ts,tsx}", "../src/**/*.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;
const DEVICE_LOCAL = /\.(getDay|getDate|getMonth|getFullYear|getHours|getMinutes|getSeconds|getTimezoneOffset|toTimeString|toDateString)\(|\.toLocale(Date|Time)?String\((?!.*timeZone)/;

describe("no code reads the device's time zone", () => {
  it("finds the sources", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it("uses no device-local date or time API in app/ or src/", () => {
    const hits = Object.entries(sources).flatMap(([file, text]) =>
      text.split("\n").flatMap((line, i) => (DEVICE_LOCAL.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(hits).toEqual([]);
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
