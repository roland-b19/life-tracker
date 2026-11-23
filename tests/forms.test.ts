import { describe, expect, it } from "vitest";
import { refusal } from "@/../app/components/forms";

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
