import { describe, expect, it } from "vitest";
import {
  NOT_A_NUMBER,
  NOT_WHOLE,
  caretInDisplay,
  editedNumberText,
  formatAmount,
  formatNumber,
  parseNumberInput,
  roundTo,
  showNumberInput,
} from "@/lib/number-format";
import { kgDelta, setKg } from "@/lib/gym-progress";
import { addWishlistItemSchema } from "@/lib/validations/wishlist";
import { sevenDayAverage } from "@/lib/weight-stats";

describe("formatNumber", () => {
  it("puts a dot between thousands and a comma before the decimals [NUM]", () => {
    expect(formatNumber(1234.5, 2)).toBe("1.234,50");
    expect(formatNumber(1234567)).toBe("1.234.567");
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber("72.4", 1)).toBe("72,4");
    expect(formatNumber(-1500.25, 1)).toBe("-1.500,3");
  });
  it("never shows a minus zero or a wrong value", () => {
    expect(formatNumber(-0.01, 1)).toBe("0,0");
    expect(formatNumber("abc")).toBe("");
  });
});

describe("formatAmount", () => {
  it("shows at most the given decimals, without trailing zeros, in the app's format [D-037]", () => {
    expect(formatAmount(72.4, 2)).toBe("72,4");
    expect(formatAmount(80, 2)).toBe("80");
    expect(formatAmount(1500.25, 2)).toBe("1.500,25");
    expect(formatAmount("72.40", 2)).toBe("72,4");
    expect(formatAmount(12.5, 1)).toBe("12,5");
    expect(formatAmount(12500, 2)).toBe("12.500");
  });
});

describe("showNumberInput", () => {
  it("shows a value the page gave in the field's format", () => {
    expect(showNumberInput("72.40")).toBe("72,40");
    expect(showNumberInput("1500")).toBe("1.500");
    expect(showNumberInput("")).toBe("");
    expect(showNumberInput("12x")).toBe("12x");
  });
});

describe("parseNumberInput", () => {
  it("takes a comma or a dot as the decimal separator [X-DECIMAL, X-DOTCOMMA]", () => {
    expect(parseNumberInput("72,5")).toEqual({ ok: true, value: "72.5", display: "72,5" });
    expect(parseNumberInput("72.5")).toEqual({ ok: true, value: "72.5", display: "72,5" });
    expect(parseNumberInput(",5")).toEqual({ ok: true, value: "0.5", display: ",5" });
    expect(parseNumberInput("-3,25")).toEqual({ ok: true, value: "-3.25", display: "-3,25" });
  });
  it("puts the thousand dots in, and reads them back [NUM]", () => {
    expect(parseNumberInput("1500")).toEqual({ ok: true, value: "1500", display: "1.500" });
    expect(parseNumberInput("1.500")).toEqual({ ok: true, value: "1500", display: "1.500" });
    expect(parseNumberInput("1.234,5")).toEqual({ ok: true, value: "1234.5", display: "1.234,5" });
    expect(parseNumberInput("12.345.6")).toEqual({ ok: true, value: "12345.6", display: "12.345,6" });
  });
  it("keeps a separator being typed", () => {
    expect(parseNumberInput("1500,")).toEqual({ ok: true, value: "1500", display: "1.500," });
    expect(parseNumberInput("-")).toEqual({ ok: true, value: "", display: "-" });
    expect(parseNumberInput("")).toEqual({ ok: true, value: "", display: "" });
  });
  it("answers an error for anything else, and drops nothing [X-DOTCOMMA]", () => {
    for (const text of ["7a2", "72,,5", "72,5,1", "1.2.3", "1.50.000", "1 500", "+5", "1e3", "5-", "--5", "1,2.5"]) {
      expect(parseNumberInput(text), text).toEqual({ ok: false, error: NOT_A_NUMBER });
    }
  });
  it("answers an error for decimals in a whole-number field", () => {
    expect(parseNumberInput("250,5", { integer: true })).toEqual({ ok: false, error: NOT_WHOLE });
    expect(parseNumberInput("250.", { integer: true })).toEqual({ ok: false, error: NOT_WHOLE });
    expect(parseNumberInput("2.500", { integer: true })).toEqual({ ok: true, value: "2500", display: "2.500" });
  });
});

describe("editedNumberText", () => {
  it("drops the field's own thousand dots and reads a typed dot as the decimal", () => {
    // "1.500" with a 0 typed at the end is fifteen thousand, not 1,5
    expect(editedNumberText("1.5000", "0", 6)).toEqual({ text: "15000", caret: 5 });
    expect(editedNumberText("1.500.", ".", 6)).toEqual({ text: "1500,", caret: 5 });
    expect(editedNumberText("1500", null, 1)).toEqual({ text: "1500", caret: 1 });
  });
  it("reads a pasted or filled-in whole text as it is", () => {
    expect(editedNumberText("1.234,5", "1.234,5", 7)).toEqual({ text: "1.234,5", caret: 7 });
  });
  it("puts the caret back after the same characters", () => {
    expect(caretInDisplay("15.000", 5)).toBe(6);
    expect(caretInDisplay("1.500,", 5)).toBe(6);
    expect(caretInDisplay("1.500", 1)).toBe(1);
  });
});

describe("roundTo", () => {
  it("rounds half away from zero on the decimal it keeps, as Math.round does", () => {
    expect([roundTo(0.1 + 0.2, 1), roundTo(1234.565, 2), roundTo(4.45, 1), roundTo(-2.5, 0), roundTo(-1.25, 1), roundTo(7, 2)]).toEqual([0.3, 1234.57, 4.5, -2, -1.2, 7]);
  });
});

// U4: the places that round a value; each keeps the output it had before they shared one helper.
describe("rounding stays as it was [U4]", () => {
  it("rounds a weight change, a plate set's kg and the 7-day average to two decimals", () => {
    expect([kgDelta(2.675), kgDelta(1234.565), kgDelta(-0.004), kgDelta(0.285)]).toEqual(["+2,68 kg", "+1.234,57 kg", "0 kg", "+0,28 kg"]);
    expect(setKg({ exerciseId: "e", loadType: "plates", load: 3 }, { e: 2.27 })).toBe(6.81);
    expect(setKg({ exerciseId: "e", loadType: "plates", load: 3 }, { e: 1.1 })).toBe(3.3);
    const day = (date: string, kilograms: number) => ({ date, kilograms });
    expect(sevenDayAverage([day("2026-11-08", 78.4), day("2026-11-09", 78.45), day("2026-11-10", 78.47)], "2026-11-10")).toBe(78.44);
  });

  it("keeps a wish's price in cents, as stored", () => {
    const price = (estimatedPrice: number) => addWishlistItemSchema.shape.estimatedPrice.parse(estimatedPrice);
    expect([price(12.345), price(249.999), price(0.285), price(1.005), price(1200.5)]).toEqual([12.35, 250, 0.28, 1, 1200.5]);
  });
});
