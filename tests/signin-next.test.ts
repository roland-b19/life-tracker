import { describe, expect, it } from "vitest";
import { afterSignIn } from "../app/signin/next-path";

describe("the page after sign-in (MORE-04)", () => {
  it("goes back to a path on this site, with its query", () => {
    expect(afterSignIn("/gym")).toBe("/gym");
    expect(afterSignIn("/health?tab=shopping")).toBe("/health?tab=shopping");
  });

  it.each([
    ["//evil.com", "protocol-relative"],
    ["/\\evil.com", "backslash"],
    ["/\t/evil.com", "a tab the browser drops"],
    ["/\n/evil.com", "a newline the browser drops"],
    ["https://evil.com/x", "absolute"],
    ["javascript:alert(1)", "a script"],
    ["gym", "relative"],
    ["", "empty"],
  ])("goes to Tasks for %j (%s)", (next) => {
    expect(afterSignIn(next)).toBe("/todos");
  });

  it("goes to Tasks without a next, or with it repeated", () => {
    expect(afterSignIn(undefined)).toBe("/todos");
    expect(afterSignIn(["/gym", "/health"])).toBe("/todos");
  });
});
