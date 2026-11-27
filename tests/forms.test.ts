import { describe, expect, it } from "vitest";
import { refusal, valuesOf } from "../app/components/forms";

describe("refusal: a refused save says why in its form while that opening is up, else in a warning toast [D-047]", () => {
  const record = (open: { now: boolean }) => {
    const inForm: string[] = [];
    const warned: string[] = [];
    const refused = refusal(() => open.now, (m) => inForm.push(m), (m) => warned.push(m));
    return { refused, inForm, warned };
  };

  it("shows the message in the form while the opening is on screen", () => {
    const { refused, inForm, warned } = record({ now: true });
    refused("Name taken");
    expect(inForm).toEqual(["Name taken"]);
    expect(warned).toEqual([]);
  });

  it("warns in a toast once the opening is gone", () => {
    const { refused, inForm, warned } = record({ now: false });
    refused("Name taken");
    expect(inForm).toEqual([]);
    expect(warned).toEqual(["Name taken"]);
  });

  it("asks whether the opening is up when the answer comes, not when the save started", () => {
    const open = { now: true };
    const { refused, inForm, warned } = record(open);
    open.now = false; // Cancel while the save is out
    refused("Failed to save");
    expect(inForm).toEqual([]);
    expect(warned).toEqual(["Failed to save"]);
  });
});

describe("valuesOf: the values an object holds for the keys an edit changed, for its Undo [D-040]", () => {
  const before = { title: "Old", reminderTime: null as string | null, category: "work", done: false };

  it("takes only the keys asked for, with the values they hold, null included", () => {
    const undo = valuesOf(before, ["title", "reminderTime"]);
    expect(undo).toEqual({ title: "Old", reminderTime: null });
    expect(Object.keys(undo)).toEqual(["title", "reminderTime"]);
  });

  it("takes nothing for no keys", () => {
    expect(valuesOf(before, [])).toEqual({});
  });

  it("keeps each key's type", () => {
    const undo = valuesOf(before, ["reminderTime", "done"]);
    const time: string | null = undo.reminderTime;
    const done: boolean = undo.done;
    expect([time, done]).toEqual([null, false]);
    // @ts-expect-error: a key not asked for is not in the result
    expect(undo.title).toBeUndefined();
  });
});
