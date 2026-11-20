import { describe, expect, it } from "vitest";
import { rowsGone } from "@/../app/components/server-state";

describe("rowsGone [X-EDIT-DELETED]", () => {
  it("names the rows a new server value no longer has", () => {
    const before = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(rowsGone(before, [{ id: "a" }, { id: "c" }, { id: "d" }])).toEqual(["b"]);
    expect(rowsGone(before, before)).toEqual([]);
  });
  it("has none for a value that is not a list of rows", () => {
    expect(rowsGone({ id: "a" }, {})).toEqual([]);
    expect(rowsGone(["x"], [])).toEqual([]);
  });
});
