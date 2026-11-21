import { describe, expect, it } from "vitest";
import { touchesOverlap } from "@/../app/components/toast";

describe("touchesOverlap [X-UNDO-STACK, XR-02, XR-07, HTODAY-08, MORE-10]", () => {
  it("matches the same row", () => {
    expect(touchesOverlap(["wishlist_items:1"], ["wishlist_items:1"])).toBe(true);
    expect(touchesOverlap(["wishlist_items:1"], ["wishlist_items:2"])).toBe(false);
    expect(touchesOverlap(["todos:1"], ["wishlist_items:1"])).toBe(false);
  });
  it("matches a whole list with any of its rows, both ways", () => {
    expect(touchesOverlap(["meals:*"], ["meals:7"])).toBe(true);
    expect(touchesOverlap(["meals:7"], ["meals:*"])).toBe(true);
    expect(touchesOverlap(["meals:*"], ["water_logs:*"])).toBe(false);
  });
  it("reads a key with no \":\" as its whole table name, never as a cut-off one", () => {
    expect(touchesOverlap(["meal:*"], ["meals"])).toBe(false);
    expect(touchesOverlap(["meals"], ["meal:*"])).toBe(false);
    expect(touchesOverlap(["meals:*"], ["meals"])).toBe(true);
  });
  it("never matches a toast that names nothing", () => {
    expect(touchesOverlap(undefined, ["meals:7"])).toBe(false);
    expect(touchesOverlap(["meals:7"], undefined)).toBe(false);
  });
});
