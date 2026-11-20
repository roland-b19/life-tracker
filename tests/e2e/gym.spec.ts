import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import { Pool } from "pg";
import { andSettle, burst, center, expectNoSeriousViolations, settled, test } from "./helpers";

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
  await page.getByRole("button", { name: `Show ${EXERCISE}`, exact: true }).click();
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

// Opens the day's editor.
async function openEditor(page: Page) {
  await pickDay(page, DAY);
  await page.getByRole("button", { name: `Edit ${DAY}` }).click();
  const editor = page.getByRole("dialog", { name: "Edit Sunday" });
  await expect(editor).toBeVisible();
  return editor;
}

// Creates an exercise from the open editor: "Create and add" puts it into the routine being edited, as row `row`.
async function createExercise(page: Page, editor: Locator, name: string, row: number) {
  await editor.getByRole("button", { name: "New exercise" }).click();
  await editor.getByLabel("New exercise").fill(name);
  await andSettle(page, () => editor.getByRole("button", { name: "Create and add" }).click(), `"name":"${name}"`);
  await expect(page.getByText(`Created "${name}"`)).toBeVisible();
  await expect(editor.getByText(`${row}. ${name}`)).toBeVisible();
  await dismissToast(page, `Created "${name}"`);
}

const toast = (page: Page, message: string) => page.locator(".toast-item").filter({ hasText: message });
const undoIn = (page: Page, message: string) => toast(page, message).getByRole("button", { name: "Undo" });
const mine = (page: Page) => page.getByRole("region", { name: "My exercises" });

// Makes custom exercises no routine uses: created in the editor, taken off the routine again, and the editor closed with
// Escape. The day is as it was, so closing shows no "Changes discarded", and the exercises stay (only Cancel deletes them).
async function customExercises(page: Page, names: string[]) {
  const editor = await openEditor(page);
  for (const [i, name] of names.entries()) await createExercise(page, editor, name, 8 + i);
  for (const name of names) await editor.getByRole("button", { name: `Remove ${name}` }).click();
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  for (const name of names) await expect(mine(page).getByText(name, { exact: true })).toBeVisible();
}

test("a signed-in user adds an exercise to a training day, with Undo, also after a reload", async ({ signedInPage: page }) => {
  await openGym(page);
  const name = exerciseName();
  const editor = await openEditor(page);
  await createExercise(page, editor, name, 8);

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

  // Created in the editor and closed without saving the day: the exercise exists on its own and "My exercises" lists it.
  await customExercises(page, [name]);
  await openGym(page);
  await expect(mine(page).getByText(name, { exact: true })).toBeVisible();

  // Delete, then Undo the delete: the same exercise comes back, also after a reload.
  await andSettle(page, () => mine(page).getByRole("button", { name: `Delete ${name}` }).click());
  await expect(mine(page).getByText(name, { exact: true })).toBeHidden();
  await expect(page.getByText(`Removed "${name}"`)).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(mine(page).getByText(name, { exact: true })).toBeVisible();
  await openGym(page);
  await expect(mine(page).getByText(name, { exact: true })).toBeVisible();

  // Delete for good: it is gone after a reload.
  await andSettle(page, () => mine(page).getByRole("button", { name: `Delete ${name}` }).click());
  await expect(mine(page).getByText("No custom exercises yet.")).toBeVisible();
  await openGym(page);
  await expect(mine(page).getByText("No custom exercises yet.")).toBeVisible();
});

test("a signed-out visit to the Gym page signs in through the form and comes back to it", async ({ page }) => {
  const name = `e2e-${randomUUID().slice(0, 8)}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
  try {
    await page.goto("/gym");
    await expect(page).toHaveURL(/\/signin\?next=%2Fgym$/);
    await page.getByLabel("Username").fill(name);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/gym$/);
    await expect(page.getByRole("region", { name: "Training days" })).toBeVisible();
  } finally {
    try {
      await admin.query("DELETE FROM users WHERE issuer = 'dev' AND subject = $1", [name]);
    } finally {
      await admin.end();
    }
  }
});

// Renames a custom exercise in its Edit form. The closed form's Save lay over the list, so Shift ends the Save's tap burst
// (D-043): the next step is not a second tap of it.
async function renameExercise(page: Page, from: string, to: string) {
  await mine(page).getByRole("button", { name: `Edit ${from}` }).click();
  const form = page.getByRole("dialog", { name: "Edit exercise" });
  await form.getByLabel("Name", { exact: true }).fill(to);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"name":"${to}"`);
  await expect(form).toBeHidden();
  await page.keyboard.press("Shift");
}

// Each Undo toast names the exercise it touches (D-040): a newer toast about the same exercise takes the older toast's
// Undo away, so the older Undo never writes over the newer change; a toast about another exercise keeps its own.
test("a newer toast about the same custom exercise takes the older toast's Undo away", async ({ signedInPage: page }) => {
  const [a, b] = [exerciseName(), exerciseName()];
  const [a2, b2] = [`${a} renamed`, `${b} renamed`];
  await openGym(page);
  await customExercises(page, [a, b]);

  // The same exercise: rename a, then delete it.
  await renameExercise(page, a, a2);
  await expect(undoIn(page, `Saved "${a2}"`)).toBeVisible();
  await andSettle(page, () => mine(page).getByRole("button", { name: `Delete ${a2}` }).click());
  await expect(undoIn(page, `Removed "${a2}"`)).toBeVisible();
  // Counted at once, not with a retrying assertion, which an expiring toast would also satisfy; the toast is still there.
  expect(await undoIn(page, `Saved "${a2}"`).count()).toBe(0);
  await expect(toast(page, `Saved "${a2}"`)).toBeVisible();

  // Another exercise: renaming b leaves the delete of a its Undo.
  await renameExercise(page, b, b2);
  await expect(undoIn(page, `Saved "${b2}"`)).toBeVisible();
  await expect(undoIn(page, `Removed "${a2}"`)).toBeVisible();
});

// A Delete acts once per tap burst (D-043): the second tap neither deletes again nor deletes the row that slid up under it.
test("a double tap on a custom exercise's Delete deletes that one exercise only", async ({ signedInPage: page }) => {
  // The list is sorted by name within a muscle group, so a comes first and b slides up into its place.
  const id = randomUUID().slice(0, 8);
  const [a, b] = [`E2E lift A ${id}`, `E2E lift B ${id}`];
  await openGym(page);
  await customExercises(page, [a, b]);
  // Chromium's scroll anchoring, which iPhone Safari does not have, would scroll the page instead of letting b slide up;
  // and the page is left 100 px short of its end, so the shorter list does not pull the page up under the finger.
  await page.addStyleTag({ content: "* { overflow-anchor: none }" });
  const remove = mine(page).getByRole("button", { name: `Delete ${a}` });
  await page.evaluate(() => window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight - 100)));
  await expect(remove).toBeInViewport();
  const removeAt = center(await remove.boundingBox());
  expect(await burst(page, removeAt)).toBe(1);
  await expect(page.getByText(`Removed "${a}"`)).toBeVisible();
  await expect(mine(page).getByText(b, { exact: true })).toBeVisible();
  // b's Delete is where the second tap landed: the guard, not a miss, kept it.
  const slid = center(await mine(page).getByRole("button", { name: `Delete ${b}` }).boundingBox());
  expect(Math.abs(slid.y - removeAt.y)).toBeLessThan(10);
  await openGym(page);
  await expect(mine(page).getByText(b, { exact: true })).toBeVisible();
  await expect(mine(page).getByText(a, { exact: true })).toBeHidden();
});

test("a double tap on the day editor's Save saves once", async ({ signedInPage: page }) => {
  const name = `Upper ${randomUUID().slice(0, 8)}`;
  await openGym(page);
  // A first save warms the dev server: the burst's second tap comes after the first save's answer, and a cold first
  // answer can take longer than the burst lasts (BURST_MS), which a real double tap never waits for.
  const warm = await openEditor(page);
  await andSettle(page, () => warm.getByRole("button", { name: "Save" }).click(), `"name":"${DAY}"`);
  await expect(warm).toBeHidden();
  await page.keyboard.press("Shift");
  const editor = await openEditor(page);
  await editor.getByLabel("Name", { exact: true }).fill(name);
  const save = editor.getByRole("button", { name: "Save" });
  await save.scrollIntoViewIfNeeded();
  expect(await burst(page, center(await save.boundingBox()))).toBe(1);
  await expect(editor).toBeHidden();
  await expect(page.getByText(`Saved "${name}"`)).toBeVisible();
});

test("saving this week as a deload week turns the deload switch on without a reload, so the workout started is a deload one", async ({
  signedInPage: page,
}) => {
  await openGym(page);
  const deloadSwitch = page.getByRole("checkbox", { name: "Deload session" });
  await expect(deloadSwitch).not.toBeChecked();

  await page.getByRole("button", { name: "Edit deload weeks" }).click();
  const dialog = page.getByRole("dialog", { name: "Deload weeks" });
  const last = dialog.getByLabel("Last deload");
  const thisWeek = await last.getByRole("option", { name: /\(this week\)$/ }).textContent();
  await last.selectOption({ label: thisWeek! });
  await andSettle(page, () => dialog.getByRole("button", { name: "Save" }).click());
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Saved deload weeks")).toBeVisible();
  // D-038: the whole week stays out of progress, as the card says.
  await expect(page.getByText("Deload weeks stay out of the progress chart and the week-before comparisons.")).toBeVisible();
  await expect(deloadSwitch).toBeChecked();
  await dismissToast(page, "Saved deload weeks");

  // The workout is stored as a deload one: its card says so, also after a reload.
  await startWorkout(page, DAY);
  const workout = page.getByRole("region", { name: DAY });
  await expect(workout.getByText("Deload", { exact: true })).toBeVisible();
  await openGym(page);
  await banner(page).getByRole("button", { name: "Resume" }).click();
  await expect(workout.getByText("Deload", { exact: true })).toBeVisible();
});

test("the day editor reorders its routine with the arrow keys, kept after a save and a reload", async ({ signedInPage: page }) => {
  await openGym(page);
  const editor = await openEditor(page);
  await editor.getByRole("button", { name: `Drag ${EXERCISE} to reorder` }).focus();
  await page.keyboard.press("ArrowDown");
  await editor.getByRole("button", { name: "Drag Bayesian curl (high) to reorder" }).focus();
  await page.keyboard.press("ArrowUp");
  const order = ["1. Cable fly (push down)", `2. ${EXERCISE}`, "6. Bayesian curl (high)", "7. Cable overhead extension (high)"];
  for (const row of order) await expect(editor.getByText(row, { exact: true })).toBeVisible();
  await andSettle(page, () => editor.getByRole("button", { name: "Save" }).click(), `"name":"${DAY}"`);
  await expect(editor).toBeHidden();
  await openGym(page);
  await pickDay(page, DAY);
  for (const row of order) await expect(page.getByRole("region", { name: DAY }).getByText(row, { exact: true })).toBeVisible();
});

// Escape, a click outside and the close button discard the edits with an Undo that reopens the editor with them (D-039).
test("the day editor closed with Escape or a click outside keeps the edits behind an Undo", async ({ signedInPage: page }) => {
  const name = `Upper ${randomUUID().slice(0, 8)}`;
  await openGym(page);

  // Nothing changed: it just closes.
  let editor = await openEditor(page);
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await settled(page);
  expect(await toast(page, "Changes discarded").count()).toBe(0);

  // Escape after edits: "Changes discarded", whose Undo reopens the editor with them.
  editor = await openEditor(page);
  await editor.getByLabel("Name", { exact: true }).fill(name);
  await editor.getByRole("button", { name: `Remove ${EXERCISE}` }).click();
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await undoIn(page, "Changes discarded").click();
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue(name);
  await expect(editor.getByRole("button", { name: `Remove ${EXERCISE}` })).toBeHidden();

  // A click outside the dialog does the same.
  await page.mouse.click(5, 5);
  await expect(editor).toBeHidden();
  await undoIn(page, "Changes discarded").click();
  await expect(editor.getByLabel("Name", { exact: true })).toHaveValue(name);
  await expect(editor.getByRole("button", { name: `Remove ${EXERCISE}` })).toBeHidden();

  // Saved at last: the day has the edits, also after a reload.
  await andSettle(page, () => editor.getByRole("button", { name: "Save" }).click(), `"name":"${name}"`);
  await expect(editor).toBeHidden();
  await openGym(page);
  await pickDay(page, name);
  await expect(page.getByRole("region", { name }).getByText(EXERCISE)).toBeHidden();
  await expect(page.getByRole("region", { name }).getByText("1. Cable fly (push down)", { exact: true })).toBeVisible();
});

test("the day editor's Cancel deletes the exercises created in it, with Undo, also after a reload", async ({ signedInPage: page }) => {
  const name = exerciseName();
  await openGym(page);
  const editor = await openEditor(page);
  await createExercise(page, editor, name, 8);
  await andSettle(page, () => editor.getByRole("button", { name: "Cancel" }).click());
  await expect(editor).toBeHidden();
  await expect(page.getByText(`Removed "${name}"`)).toBeVisible();
  // The list comes from the server, so it shows the delete is stored.
  await expect(mine(page).getByText("No custom exercises yet.")).toBeVisible();

  // Undo brings it back, also after a reload.
  await andSettle(page, () => undoIn(page, `Removed "${name}"`).click());
  await expect(mine(page).getByText(name, { exact: true })).toBeVisible();
  await openGym(page);
  await expect(mine(page).getByText(name, { exact: true })).toBeVisible();

  // Cancel again, with nothing created this time: the exercise made in the earlier session stays.
  const again = await openEditor(page);
  await again.getByRole("button", { name: "Cancel" }).click();
  await expect(again).toBeHidden();
  await settled(page);
  await openGym(page);
  await expect(mine(page).getByText(name, { exact: true })).toBeVisible();
});

test("the day editor's search narrows the exercises to add, with spaces, case and a trailing period ignored", async ({ signedInPage: page }) => {
  await openGym(page);
  const editor = await openEditor(page);
  const search = editor.getByLabel("Search exercises");
  // The drop-down's name also holds the exercise it shows.
  const options = editor.getByRole("combobox", { name: /^Exercise/ }).getByRole("option");

  // The routine's own Bayesian curl is not offered again.
  await search.fill("  CURL.");
  await expect(options).toHaveText(["Dumbbell curl", "Incline curl", "Seated/lying hamstring curl"]);
  await search.fill("nothing like this");
  await expect(editor.getByText("No exercise matches.")).toBeVisible();
  await expect(editor.getByRole("button", { name: "Add exercise" })).toBeHidden();

  await search.fill("dumbbell curl");
  await editor.getByRole("button", { name: "Add exercise" }).click();
  await expect(editor.getByText("8. Dumbbell curl", { exact: true })).toBeVisible();
});
