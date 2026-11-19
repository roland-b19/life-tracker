import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { andSettle, expectNoSeriousViolations, test } from "./helpers";

// A new user gets the default split (Upper / Lower 5-Day) when the page first loads. The day the page selects at load
// depends on the date and some days are rest days, so the spec always picks a day by its name, never by the date.
const DAY = "Upper (chest)"; // Sunday; 7 exercises, the first is "Incline barbell press" (a barbell: its load is in kg)
const EXERCISE = "Incline barbell press";
// The set line in the workout card ("Set 1: 5 reps × 60,00 kg": the load shows as the database stores it, so either separator).
const SET_LINE = /Set 1: 5 reps × 60[.,]00 kg/;

async function openGym(page: Page) {
  await page.goto("/gym");
  await expect(page).toHaveURL(/\/gym$/);
  await expect(page.getByRole("region", { name: "Training days" })).toBeVisible();
}

// The day's button in "Training days" (its name starts with the weekday; the Start buttons' names do not).
async function pickDay(page: Page, name: string) {
  const escaped = name.replace(/[()]/g, "\\$&");
  const button = page.getByRole("region", { name: "Training days" }).getByRole("button", { name: new RegExp(`^[A-Z][a-z]+day .*${escaped}$`) });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name })).toBeVisible();
}

async function startWorkout(page: Page, name: string) {
  await andSettle(page, () => page.getByRole("region", { name: "Training days" }).getByRole("button", { name: `Start ${name}`, exact: true }).click());
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeVisible();
}

async function dismissToast(page: Page, message: string | RegExp) {
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByText(message)).toBeHidden();
}

// Opens the exercise (a closed exercise shows no set form) and logs one set of 5 reps at 60 kg; reps start at the day's minimum.
async function logSet(page: Page) {
  await page.getByRole("button", { name: EXERCISE, exact: true }).click();
  await page.getByLabel("Value").fill("60");
  await andSettle(page, () => page.getByRole("button", { name: "Log set" }).click());
}

const banner = (page: Page) => page.getByRole("region", { name: "Workout in progress" });
const history = (page: Page) => page.getByRole("region", { name: "History" });

// Tests tagged @a11y run on every project (desktop and phone width, dark and light); the rest run on desktop only, because only the
// axe scan depends on the width and the color scheme (see playwright.config.ts).
test("the Gym page has no serious violations, also with a day's editor open and a workout started", { tag: "@a11y" }, async ({ signedInPage: page }) => {
  await openGym(page);
  await expectNoSeriousViolations(page);

  await pickDay(page, DAY);
  await page.getByRole("button", { name: `Edit ${DAY}` }).click();
  await expect(page.getByRole("dialog", { name: "Edit Sunday" })).toBeVisible();
  await expectNoSeriousViolations(page);
  await page.getByRole("dialog", { name: "Edit Sunday" }).getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Edit Sunday" })).toBeHidden();

  await startWorkout(page, DAY);
  await expectNoSeriousViolations(page);
});

test("a signed-in user starts a workout, logs a set and finishes it, with Undo for each, also after a reload", async ({ signedInPage: page }) => {
  await openGym(page);
  await expect(page.getByText("No finished workouts yet.")).toBeVisible();

  // Start; Undo is allowed while nothing is logged and takes the user back to the list.
  await startWorkout(page, DAY);
  await expect(page.getByText(`Started "${DAY}"`)).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(page.getByRole("region", { name: "Training days" })).toBeVisible();
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeHidden();
  await openGym(page);
  await expect(banner(page)).toBeHidden();

  // Start again and log a set; Undo takes the set away, logging again brings it back.
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await logSet(page);
  await expect(page.getByText("Added set 1")).toBeVisible();
  await expect(page.getByText(SET_LINE)).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(page.getByText(SET_LINE)).toBeHidden();
  await dismissToast(page, "Added set 1").catch(() => {}); // the Undo already closed the toast
  await andSettle(page, () => page.getByRole("button", { name: "Log set" }).click());
  await expect(page.getByText(SET_LINE)).toBeVisible();
  await dismissToast(page, "Added set 1");

  // Finish: the workout goes to History. Undo reopens it, also after a reload.
  await andSettle(page, () => page.getByRole("button", { name: "Finish workout" }).click());
  await expect(page.getByText(/^Finished the workout/)).toBeVisible();
  await expect(history(page).getByText("1 workout", { exact: true })).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeVisible();
  await expect(page.getByText(SET_LINE)).toBeVisible();
  await openGym(page);
  await expect(banner(page).getByText(`${DAY} · 1 set logged`)).toBeVisible();
  await expect(history(page).getByText("0 workouts", { exact: true })).toBeVisible();

  // Resume and finish for good: still in History after a reload, with its set.
  await banner(page).getByRole("button", { name: "Resume" }).click();
  await andSettle(page, () => page.getByRole("button", { name: "Finish workout" }).click());
  await expect(page.getByText(/^Finished the workout/)).toBeVisible();
  await openGym(page);
  await expect(banner(page)).toBeHidden();
  await expect(history(page).getByText("1 workout", { exact: true })).toBeVisible();
  await history(page).getByRole("button", { name: new RegExp(DAY.replace(/[()]/g, "\\$&")) }).click();
  await expect(history(page).getByText(EXERCISE, { exact: true })).toBeVisible();
  await expect(history(page).getByText("5 × 60 kg")).toBeVisible();
});

test("a signed-in user cancels a workout and its sets, with Undo, also after a reload", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await logSet(page);
  await dismissToast(page, "Added set 1");

  // Cancel asks first; Keep leaves the workout as it was.
  await page.getByRole("button", { name: "Cancel workout" }).click();
  await expect(page.getByText("Delete this workout and its sets?")).toBeVisible();
  await page.getByRole("button", { name: "Keep" }).click();
  await expect(page.getByText("Delete this workout and its sets?")).toBeHidden();
  await expect(page.getByText(SET_LINE)).toBeVisible();

  // Delete: the workout and its set are gone; Undo brings both back, also after a reload.
  await page.getByRole("button", { name: "Cancel workout" }).click();
  await andSettle(page, () => page.getByRole("button", { name: "Delete", exact: true }).click());
  await expect(page.getByText("Cancelled the workout")).toBeVisible();
  await expect(page.getByRole("region", { name: "Training days" })).toBeVisible();
  await expect(page.getByText("No finished workouts yet.")).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeVisible();
  await expect(page.getByText(SET_LINE)).toBeVisible();
  await openGym(page);
  await expect(banner(page).getByText(`${DAY} · 1 set logged`)).toBeVisible();

  // Cancel it for good: nothing is left after a reload.
  await banner(page).getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Cancel workout" }).click();
  await andSettle(page, () => page.getByRole("button", { name: "Delete", exact: true }).click());
  await expect(page.getByText("Cancelled the workout")).toBeVisible();
  await openGym(page);
  await expect(banner(page)).toBeHidden();
  await expect(page.getByText("No finished workouts yet.")).toBeVisible();
});

const exerciseName = () => `E2E lift ${randomUUID().slice(0, 8)}`;

// Opens the day's editor and creates an exercise from it ("Create and add" puts it into the routine being edited).
async function createExercise(page: Page, name: string) {
  await pickDay(page, DAY);
  await page.getByRole("button", { name: `Edit ${DAY}` }).click();
  const editor = page.getByRole("dialog", { name: "Edit Sunday" });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "New exercise" }).click();
  await editor.getByLabel("New exercise").fill(name);
  await andSettle(page, () => editor.getByRole("button", { name: "Create and add" }).click(), `"name":"${name}"`);
  await expect(page.getByText(`Created "${name}"`)).toBeVisible();
  await expect(editor.getByText(`8. ${name}`)).toBeVisible();
  await dismissToast(page, `Created "${name}"`);
  return editor;
}

test("a signed-in user adds an exercise to a training day, with Undo, also after a reload", async ({ signedInPage: page }) => {
  await openGym(page);
  const name = exerciseName();
  const editor = await createExercise(page, name);

  // Save the day: the routine lists the exercise, also after a reload.
  await andSettle(page, () => editor.getByRole("button", { name: "Save" }).click(), `"name":"${DAY}"`);
  await expect(editor).toBeHidden();
  await expect(page.getByText(`Saved "${DAY}"`)).toBeVisible();
  const routine = page.getByRole("region", { name: DAY });
  await expect(routine.getByText(`8. ${name}`)).toBeVisible();
  await openGym(page);
  await pickDay(page, DAY);
  await expect(page.getByRole("region", { name: DAY }).getByText(`8. ${name}`)).toBeVisible();

  // Edit again, save and Undo: the old routine is back, also after a reload.
  await page.getByRole("button", { name: `Edit ${DAY}` }).click();
  const again = page.getByRole("dialog", { name: "Edit Sunday" });
  await again.getByRole("button", { name: `Remove ${name}` }).click();
  await expect(again.getByText(`8. ${name}`)).toBeHidden();
  await andSettle(page, () => again.getByRole("button", { name: "Save" }).click(), `"name":"${DAY}"`);
  await expect(again).toBeHidden();
  await expect(page.getByRole("region", { name: DAY }).getByText(`8. ${name}`)).toBeHidden();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click(), `"name":"${DAY}"`);
  await expect(page.getByRole("region", { name: DAY }).getByText(`8. ${name}`)).toBeVisible();
  await openGym(page);
  await pickDay(page, DAY);
  await expect(page.getByRole("region", { name: DAY }).getByText(`8. ${name}`)).toBeVisible();
});

test("a signed-in user creates and deletes a custom exercise, with Undo, also after a reload", async ({ signedInPage: page }) => {
  await openGym(page);
  const name = exerciseName();
  const editor = await createExercise(page, name);

  // Close the editor without saving the day: the exercise exists on its own and "My exercises" lists it.
  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(editor).toBeHidden();
  const mine = page.getByRole("region", { name: "My exercises" });
  await expect(mine.getByText(name, { exact: true })).toBeVisible();
  await openGym(page);
  await expect(mine.getByText(name, { exact: true })).toBeVisible();

  // Delete, then Undo the delete: the same exercise comes back, also after a reload.
  await andSettle(page, () => mine.getByRole("button", { name: `Delete ${name}` }).click());
  await expect(mine.getByText(name, { exact: true })).toBeHidden();
  await expect(page.getByText(`Removed "${name}"`)).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(mine.getByText(name, { exact: true })).toBeVisible();
  await openGym(page);
  await expect(mine.getByText(name, { exact: true })).toBeVisible();

  // Delete for good: it is gone after a reload.
  await andSettle(page, () => mine.getByRole("button", { name: `Delete ${name}` }).click());
  await expect(mine.getByText("No custom exercises yet.")).toBeVisible();
  await openGym(page);
  await expect(mine.getByText("No custom exercises yet.")).toBeVisible();
});
