import { describe, expect, it } from "vitest";
import { compareChecked, compareShopping } from "@/lib/check-order";

const row = (name: string, isBought: boolean, checkedAt: string | null) => ({ name, isBought, checkedAt });

describe("the order every checklist shares", () => {
  it("puts unchecked rows first, the newest tick at the top of the checked ones", () => {
    const rows = [
      { done: true, at: "2026-11-01T10:00:00Z" },
      { done: false, at: null },
      { done: true, at: "2026-11-01T11:00:00Z" },
    ];
    expect(rows.sort(compareChecked).map((r) => `${r.done}@${r.at}`)).toEqual([
      "false@null",
      "true@2026-11-01T11:00:00Z",
      "true@2026-11-01T10:00:00Z",
    ]);
  });

  it("puts a just-unticked row at the bottom of the unchecked ones, after rows nobody touched", () => {
    const rows = [row("b", false, "2026-11-01T11:00:00Z"), row("z", false, null), row("a", false, "2026-11-01T10:00:00Z"), row("c", false, null)];
    expect(rows.sort(compareShopping).map((r) => r.name)).toEqual(["c", "z", "a", "b"]);
  });

  it("orders untouched shopping rows by name", () => {
    const rows = [row("pears", false, null), row("apples", false, null)];
    expect(rows.sort(compareShopping).map((r) => r.name)).toEqual(["apples", "pears"]);
  });
});
