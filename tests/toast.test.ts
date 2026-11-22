import { readdirSync, readFileSync } from "node:fs";
import ts from "typescript";
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

// conventions.md, Undo keys: a toast with Undo names the rows it touches, so a newer toast about one of them takes its Undo
// away. The theme toast changes no row (the theme lives on the device, D-024), so it has nothing to name.
describe("every Undo toast in app/ names the rows it touches [D-040]", () => {
  const noRow = ["app/components/appearance-card.tsx"];
  const files = readdirSync("app", { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => `app/${f}`)
    .filter((f) => !noRow.includes(f));
  it.each(files)("%s", (file) => {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const missing: number[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const props = new Map(node.properties.flatMap((p) => (p.name ? [[p.name.getText(source), p] as const] : [])));
        const undo = props.get("onUndo");
        // `onUndo: undefined` takes an Undo away; it shows none.
        const shows = undo && !(ts.isPropertyAssignment(undo) && undo.initializer.getText(source) === "undefined");
        if (shows && !props.has("touches")) missing.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(missing, "lines of toasts with an Undo and no touches").toEqual([]);
  });
});
