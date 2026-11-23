import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { touchesOverlap, undoWith } from "@/../app/components/toast";
import { pushSubscriptions } from "@/db/schema";

const sources = import.meta.glob("../app/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

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

// conventions.md, Undo (D-047): a Retry is for an answer that never came; a refusal is the server's answer, so the
// warning says it and offers nothing to try again.
describe("undoWith offers Retry only when no answer came [D-047]", () => {
  const undoAnswering = async (write: () => Promise<unknown>) => {
    const showToast = vi.fn();
    await undoWith(showToast, write as () => Promise<{ success?: boolean } | null>)({ touches: ["meals:1"] });
    return showToast.mock.calls.map(([toast]) => ({ message: toast.message, retry: typeof toast.onRetry === "function", touches: toast.touches }));
  };

  it("shows a refusal's reason (by default) with no Retry", async () => {
    expect(await undoAnswering(async () => ({ success: false, error: "This item no longer exists." }))).toEqual([
      { message: "This item no longer exists.", retry: false, touches: ["meals:1"] },
    ]);
  });
  it("keeps a Retry when the write did not answer, threw or said no", async () => {
    for (const write of [async () => null, async () => undefined, async () => false, () => Promise.reject(new Error("lost"))]) {
      expect(await undoAnswering(write)).toEqual([{ message: "Failed to undo", retry: true, touches: ["meals:1"] }]);
    }
  });
  it("says nothing when the write succeeded", async () => {
    expect(await undoAnswering(async () => ({ success: true }))).toEqual([]);
    expect(await undoAnswering(async () => true)).toEqual([]);
  });
});

// conventions.md, Undo keys: a toast with Undo names the rows it touches, so a newer toast about one of them takes its Undo
// away. The theme toast names the key the device keeps it under (D-047).
describe("every Undo toast in app/ names the rows it touches [D-040]", () => {
  const files = Object.entries(sources);
  it("finds the sources", () => {
    expect(files.length).toBeGreaterThan(30);
  });
  it.each(files)("%s", (file, text) => {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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

describe('the "Reminders enabled" toast names the subscription row it saved [D-040]', () => {
  it("touches the push_subscriptions row the save answered", () => {
    const file = "../app/todos/todos-client.tsx";
    const source = ts.createSourceFile(file, sources[file], ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const value = (name: string) =>
          node.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(source) === name)?.initializer.getText(source);
        if (value("message") === '"Reminders enabled"') found.push(value("touches") ?? "none");
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    // The saved row's id, under the table the Undo deletes it from.
    expect(found).toEqual([`[\`${getTableName(pushSubscriptions)}:\${res.subscription.id}\`]`]);
  });
});
