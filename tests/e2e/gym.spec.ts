import { NOTHING_TO_SAVE, TWO_DECIMALS } from "../../src/lib/validations/common";
import { alreadyExists } from "../../src/lib/validations/result";
import { GYM_LIMITS, NOTES_CHANGED, WORKOUT_ENDED_ELSEWHERE, WORKOUT_FINISHED, WORKOUT_GONE, ZERO_LOAD } from "../../src/lib/validations/gym";
import { randomUUID } from "node:crypto";
import { expect, type Browser, type Locator, type Page, type Request } from "@playwright/test";
import { addDays, formatDMY, toISODate, weekStart } from "../../src/lib/format-date";
import {
  andSettle,
  asOwner,
  burst,
  center,
  countWrites,
  dismissToast,
  expectNoSeriousViolations,
  expectToastWithoutUndo,
  headIsQuiet,
  holdWrites,
  hydrationWarnings,
  loseAnswerOnce,
  installStoppedClock,
  isRefresh,
  newDevice,
  pauseClock,
  refreshesDone,
  settled,
  signedInUserId,
  signInThroughForm,
  test,
  toast,
  undoIn,
} from "./helpers";

// A new user gets the default split (Upper / Lower 5-Day) when the page first loads. The day the page selects at load
// depends on the date and some days are rest days, so the spec always picks a day by its name, never by the date.
const DAY = "Upper (chest)"; // Sunday; 7 exercises, the first is "Incline barbell press" (a barbell: its load is in kg)
const EXERCISE = "Incline barbell press";
// The set line in the workout card, in the app's number format (D-037).
const SET_LINE = /Set 1: 5 × 60 kg/;

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

// Opens the exercise (a closed exercise shows no set form) and logs one set of 5 reps at 60 kg; reps start at the day's minimum.
async function logSet(page: Page) {
  await page.getByRole("button", { name: `Show ${EXERCISE}`, exact: true }).click();
  await page.getByLabel("Value").fill("60");
  await andSettle(page, () => page.getByRole("button", { name: "Log set" }).click());
  // Ends Log set's tap burst (D-043): the next step may scroll its button onto the spot Log set had on screen.
  await page.keyboard.press("Shift");
}

const banner = (page: Page) => page.getByRole("region", { name: "Workout in progress" });

// Another device of the page's user, on the Gym page: a browser of its own, since pages of one browser share the app's
// BroadcastChannel (D-034) and a write in one refreshes the others at once. Its clock stands still from before the page
// loads, so it refreshes nothing by itself either: it shows what it loaded and its own writes, as a device that has not
// refreshed yet does.
// Close it with `other.context().close()`.
async function otherDevice(browser: Browser, page: Page) {
  const other = await (await newDevice(browser, page)).newPage();
  await installStoppedClock(other);
  await openGym(other);
  return other;
}
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
  await expect(toast(page, "Added set 1")).toBeHidden(); // the Undo closed the toast
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

// D-040, D-047: the new exercise's form makes its id when it opens, so Create and add again after a lost answer sends
// the same exercise, which the server answers with the row the first add made: it goes into the routine, once.
test("Create and add again after a lost answer adds the new exercise to the routine once", async ({ signedInPage: page }) => {
  await openGym(page);
  const name = exerciseName();
  const editor = await openEditor(page);
  await editor.getByRole("button", { name: "New exercise" }).click();
  await editor.getByLabel("New exercise").fill(name);
  await loseAnswerOnce(page, `"name":"${name}"`);
  await editor.getByRole("button", { name: "Create and add" }).click();
  await expect(page.getByText("Couldn't confirm the change. Reloaded.")).toBeVisible();
  await expect(editor.getByText("Failed to add exercise")).toBeVisible();
  // The refresh after the lost answer brings the exercise the first add made, a little after the refresh's answer: once
  // the editor lists it, the name check would refuse the name as taken, unless it skips this form's own id.
  await refreshesDone(page);
  await page.evaluate(headIsQuiet);
  await expect(editor.locator("option", { hasText: name })).toHaveCount(1);

  // Shift ends the tap burst (D-043): this tap is a second one, on purpose.
  await page.keyboard.press("Shift");
  await andSettle(page, () => editor.getByRole("button", { name: "Create and add" }).click(), `"name":"${name}"`);
  await expect(editor.getByText(`8. ${name}`)).toBeVisible();
  await andSettle(page, () => editor.getByRole("button", { name: "Save" }).click(), `"name":"${DAY}"`);
  await expect(editor).toBeHidden();
  await expect(page.getByRole("region", { name: DAY }).getByText(`8. ${name}`)).toBeVisible();
  const userId = await signedInUserId(page);
  const { rows } = await asOwner((admin) => admin.query("SELECT count(*)::int AS n FROM exercises WHERE user_id = $1 AND name = $2", [userId, name]));
  expect(rows).toEqual([{ n: 1 }]);
});

// D-040, D-047: each opening of the new exercise's form makes its own id, so a second exercise made in the same editor
// is a new row, not the first one sent again. The name check still refuses a name that is really taken (a custom
// exercise made here, or a default one), and sends nothing.
test("two new exercises made in one editor opening are two rows, and a taken name is still refused", async ({ signedInPage: page }) => {
  await openGym(page);
  const [a, b] = [exerciseName(), exerciseName()];
  const editor = await openEditor(page);
  await createExercise(page, editor, a, 8);
  await createExercise(page, editor, b, 9);

  await editor.getByRole("button", { name: "New exercise" }).click();
  await editor.getByLabel("New exercise").fill(a);
  const writes = countWrites(page);
  await editor.getByRole("button", { name: "Create and add" }).click();
  await expect(editor.getByText(alreadyExists(a))).toBeVisible();
  await editor.getByLabel("New exercise").fill(EXERCISE);
  // Ends the tap burst (D-043): this tap is a second one, on purpose.
  await page.keyboard.press("Shift");
  await editor.getByRole("button", { name: "Create and add" }).click();
  await expect(editor.getByText(alreadyExists(EXERCISE))).toBeVisible();
  await settled(page);
  expect(writes).toHaveLength(0);
  const userId = await signedInUserId(page);
  const { rows } = await asOwner((admin) =>
    admin.query("SELECT name FROM exercises WHERE user_id = $1 AND name = ANY($2) ORDER BY name", [userId, [a, b]]),
  );
  expect(rows.map((r: { name: string }) => r.name)).toEqual([a, b].sort());
});

test("a signed-in user creates and deletes a custom exercise, with Undo, also after a reload", async ({ signedInPage: page }) => {
  await openGym(page);
  const name = exerciseName();

  // Created in the editor and closed without saving the day: the exercise exists on its own and "My exercises" lists it.
  await customExercises(page, [name]);
  await openGym(page);
  await expect(mine(page).getByText(name, { exact: true })).toBeVisible();

  // Delete, then Undo the delete: the same exercise comes back, also after a reload. The row leaves and the toast
  // shows before the answer (D-047).
  const release = await holdWrites(page);
  await mine(page).getByRole("button", { name: `Delete ${name}` }).click();
  await expect(mine(page).getByText(name, { exact: true })).toBeHidden();
  await expect(page.getByText(`Removed "${name}"`)).toBeVisible();
  await andSettle(page, () => release());
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
  await signInThroughForm(page, "/gym", (page) => expect(page.getByRole("region", { name: "Training days" })).toBeVisible());
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
// Undo away, so the older Undo never writes over the newer change; a toast about another exercise keeps its own. The
// page's clock stands still from the first toast on and moves 1 s only, for the refresh that shows a's new name, so no
// toast runs out (it stays 5 s) however slow the machine is.
test("a newer toast about the same custom exercise takes the older toast's Undo away", async ({ signedInPage: page }) => {
  const [a, b] = [exerciseName(), exerciseName()];
  const [a2, b2] = [`${a} renamed`, `${b} renamed`];
  await page.clock.install();
  await openGym(page);
  await customExercises(page, [a, b]);
  await pauseClock(page);

  // The same exercise: rename a, then delete it.
  await renameExercise(page, a, a2);
  await page.clock.runFor(1000);
  await expect(undoIn(page, `Saved "${a2}"`)).toBeVisible();
  await andSettle(page, () => mine(page).getByRole("button", { name: `Delete ${a2}` }).click());
  await expect(undoIn(page, `Removed "${a2}"`)).toBeVisible();
  await expectToastWithoutUndo(page, `Saved "${a2}"`);

  // Another exercise: renaming b leaves the delete of a its Undo.
  await renameExercise(page, b, b2);
  await expect(undoIn(page, `Saved "${b2}"`)).toBeVisible();
  await expect(undoIn(page, `Removed "${a2}"`)).toBeVisible();
});

// A double tap with the page's clock standing still (`page.clock`, installed before the page opens): the second tap comes
// after the first write's answer (see `burst`), and a slow answer from the dev server would otherwise outlast the tap burst
// (BURST_MS), which a real double tap, 40 ms apart, never waits for.
async function stillBurst(page: Page, spot: { x: number; y: number }) {
  await pauseClock(page);
  const writes = await burst(page, spot);
  await page.clock.resume();
  return writes;
}

// A Delete acts once per tap burst (D-043): the second tap neither deletes again nor deletes the row that slid up under it.
test("a double tap on a custom exercise's Delete deletes that one exercise only", async ({ signedInPage: page }) => {
  // The list is sorted by name within a muscle group, so a comes first and b slides up into its place.
  const id = randomUUID().slice(0, 8);
  const [a, b] = [`E2E lift A ${id}`, `E2E lift B ${id}`];
  await page.clock.install();
  await openGym(page);
  await customExercises(page, [a, b]);
  // Chromium's scroll anchoring, which iPhone Safari does not have, would scroll the page instead of letting b slide up;
  // and the page is left 100 px short of its end, so the shorter list does not pull the page up under the finger.
  await page.addStyleTag({ content: "* { overflow-anchor: none }" });
  const remove = mine(page).getByRole("button", { name: `Delete ${a}` });
  await page.evaluate(() => window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight - 100)));
  await expect(remove).toBeInViewport();
  const removeAt = center(await remove.boundingBox());
  expect(await stillBurst(page, removeAt)).toBe(1);
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
  await page.clock.install();
  await openGym(page);
  const editor = await openEditor(page);
  await editor.getByLabel("Name", { exact: true }).fill(name);
  const save = editor.getByRole("button", { name: "Save" });
  await save.scrollIntoViewIfNeeded();
  expect(await stillBurst(page, center(await save.boundingBox()))).toBe(1);
  await expect(editor).toBeHidden();
  await expect(page.getByText(`Saved "${name}"`)).toBeVisible();
});

// FormModal owns each opening (D-047): a Gym form's save lost after its Cancel says so in a toast, not in the form opened
// next, which is its own opening: its Save is free and the late answer leaves what is typed in it. Before, the Gym page's
// saving flag (or the form's own) kept the form, or the button that opens it, waiting for the first save. A form that
// keeps its opening while its save is out (`keepsOpening`: the day editor, the deload form) would wait for that save if
// opened again before the answer, so it is opened again after it.
async function lostAfterCancel(
  page: Page,
  o: { open: () => Promise<Locator>; type: (form: Locator, n: 1 | 2) => Promise<void>; held: string; failed: string; keepsOpening?: boolean },
) {
  const release = await holdWrites(page, o.held);
  let form = await o.open();
  await o.type(form, 1);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();

  const lose = async () => {
    await release(true);
    await expect(toast(page, o.failed)).toBeVisible();
  };
  if (o.keepsOpening) await lose();
  form = await o.open();
  await o.type(form, 2);
  if (!o.keepsOpening) await lose();
  await expect(form).toBeVisible();
  await expect(form.getByRole("button", { name: "Save" })).toBeEnabled();
  await expect(form.getByRole("alert")).toHaveCount(0);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form).toBeHidden();
}

test("a day save lost after Cancel shows as a toast, and the editor opened again saves its own edits [D-047]", async ({ signedInPage: page }) => {
  await openGym(page);
  const name = (n: number) => `Upper ${n} ${randomUUID().slice(0, 8)}`;
  const names = [name(1), name(2)];
  await lostAfterCancel(page, {
    open: () => openEditor(page),
    type: async (editor, n) => {
      const field = editor.getByLabel("Name", { exact: true });
      await field.fill(names[n - 1]);
      if (n === 2) await expect(field).toHaveValue(names[1]);
    },
    held: `"name":"${names[0]}"`,
    failed: "Failed to save day",
    keepsOpening: true,
  });
  await expect(page.getByText(`Saved "${names[1]}"`)).toBeVisible();
  await expect(page.getByRole("button", { name: `Edit ${names[1]}` })).toBeVisible();
});

test("a deload weeks save lost after Cancel shows as a toast, and the form opened again saves its own choice [D-047]", async ({ signedInPage: page }) => {
  await openGym(page);
  await lostAfterCancel(page, {
    open: async () => {
      await page.getByRole("button", { name: "Edit deload weeks" }).click();
      const dialog = page.getByRole("dialog", { name: "Deload weeks" });
      await expect(dialog).toBeVisible();
      return dialog;
    },
    type: async (dialog, n) => {
      const select = dialog.getByLabel(n === 1 ? "Last deload" : "Next deload");
      const thisWeek = await select.getByRole("option", { name: /\(this week\)$/ }).textContent();
      await select.selectOption({ label: thisWeek! });
    },
    held: `"last":"`,
    failed: "Failed to save deload weeks",
    keepsOpening: true,
  });
  await expect(page.getByText("Saved deload weeks")).toBeVisible();
});

// The day editor and the deload form keep their opening while its save is out (D-047, `keepsOpening`): opened again
// before the answer, the form waits as the same opening (Save says "Saving...", the fields are disabled) and the answer
// closes it. A form opened afresh would show the day or the weeks as they were, and its Save would undo the first one.
test("the day editor opened again while its save is out waits for it, and the save's change stays [D-047]", async ({ signedInPage: page }) => {
  await openGym(page);
  const userId = await signedInUserId(page);
  const sets = async () =>
    (
      await asOwner((admin) =>
        admin.query(
          `SELECT r.target_sets FROM workout_split_day_exercises r JOIN workout_split_days d ON d.id = r.split_day_id
           JOIN exercises e ON e.id = r.exercise_id WHERE d.user_id = $1 AND d.name = $2 AND e.name = $3`,
          [userId, DAY, EXERCISE],
        ),
      )
    ).rows.map((r) => r.target_sets);
  expect(await sets()).toEqual([2]);
  const writes = countWrites(page, `"name":"${DAY}"`);
  const release = await holdWrites(page, `"name":"${DAY}"`);
  let editor = await openEditor(page);
  await editor.getByLabel("Sets", { exact: true }).first().fill("5");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(editor).toBeHidden();

  editor = await openEditor(page);
  await expect(editor.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await expect(editor.getByLabel("Sets", { exact: true }).first()).toBeDisabled();
  await release();
  await expect(editor).toBeHidden();
  await expect(toast(page, `Saved "${DAY}"`)).toBeVisible();
  expect(await sets()).toEqual([5]);
  expect(writes).toHaveLength(1);

  // Opened after the answer and its refresh, it is a new opening with the saved day.
  await refreshesDone(page);
  editor = await openEditor(page);
  await expect(editor.getByLabel("Sets", { exact: true }).first()).toHaveValue("5");
  await expect(editor.getByRole("button", { name: "Save" })).toBeEnabled();
});

test("the deload form opened again while its save is out waits for it, and the save's week stays [D-047]", async ({ signedInPage: page }) => {
  await openGym(page);
  const userId = await signedInUserId(page);
  const weeks = async () =>
    (await asOwner((admin) => admin.query("SELECT week_start::text AS week FROM deload_weeks WHERE user_id = $1", [userId]))).rows.map((r) => r.week);
  const thisWeek = weekStart(toISODate());
  expect(await weeks()).toEqual([]);
  const writes = countWrites(page, `"last":`);
  const release = await holdWrites(page, `"last":"${thisWeek}"`);
  const edit = page.getByRole("button", { name: "Edit deload weeks" });
  const dialog = page.getByRole("dialog", { name: "Deload weeks" });
  await edit.click();
  await dialog.getByLabel("Last deload").selectOption(thisWeek);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  await edit.click();
  await expect(dialog.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await expect(dialog.getByLabel("Last deload")).toBeDisabled();
  await release();
  await expect(dialog).toBeHidden();
  await expect(toast(page, "Saved deload weeks")).toBeVisible();
  expect(await weeks()).toEqual([thisWeek]);
  expect(writes).toHaveLength(1);

  // Opened after the answer and its refresh, it is a new opening with the saved week.
  await refreshesDone(page);
  await edit.click();
  await expect(dialog.getByLabel("Last deload")).toHaveValue(thisWeek);
  await expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled();
});

test("a custom exercise save lost after Cancel shows as a toast, and the form opened again saves its own name [D-047]", async ({ signedInPage: page }) => {
  const names = [exerciseName(), exerciseName(), exerciseName()];
  await openGym(page);
  await customExercises(page, [names[0]]);
  await lostAfterCancel(page, {
    open: async () => {
      await mine(page).getByRole("button", { name: `Edit ${names[0]}` }).click();
      const form = page.getByRole("dialog", { name: "Edit exercise" });
      await expect(form).toBeVisible();
      return form;
    },
    type: async (form, n) => {
      const field = form.getByLabel("Name", { exact: true });
      await field.fill(names[n]);
      if (n === 2) await expect(field).toHaveValue(names[2]);
    },
    held: `"name":"${names[1]}"`,
    failed: "Failed to save exercise",
  });
  await expect(mine(page).getByText(names[2], { exact: true })).toBeVisible();
  await expect(mine(page).getByText(names[1], { exact: true })).toHaveCount(0);
});

// An answer belongs to its opening (D-047): the first opening's save, answered with success after its Cancel while the
// form is open again, neither closes that form nor clears what is typed in it, and its toast still shows.
test("a custom exercise save answered after Cancel leaves the form opened again as it is, and still shows its toast [D-047]", async ({
  signedInPage: page,
}) => {
  const names = [exerciseName(), exerciseName(), exerciseName()];
  await openGym(page);
  await customExercises(page, [names[0]]);
  const form = page.getByRole("dialog", { name: "Edit exercise" });
  const field = form.getByLabel("Name", { exact: true });
  const release = await holdWrites(page, `"name":"${names[1]}"`);
  await mine(page).getByRole("button", { name: `Edit ${names[0]}` }).click();
  await field.fill(names[1]);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();

  await mine(page).getByRole("button", { name: `Edit ${names[0]}` }).click();
  await field.fill(names[2]);
  await andSettle(page, () => release(), `"name":"${names[1]}"`);
  await expect(toast(page, `Saved "${names[1]}"`)).toBeVisible();
  await expect(form).toBeVisible();
  await expect(field).toHaveValue(names[2]);
  await expect(form.getByRole("button", { name: "Save" })).toBeEnabled();
  await expect(form.getByRole("alert")).toHaveCount(0);
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
  // Cancel is not Escape: the edits are not offered back.
  expect(await toast(page, "Changes discarded").count()).toBe(0);
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

const setCount = async (userId: string) =>
  Number(
    (
      await asOwner((admin) =>
        admin.query("SELECT count(*) FROM workout_sets ws JOIN workout_sessions s ON s.id = ws.session_id WHERE s.user_id = $1", [userId]),
      )
    ).rows[0].count,
  );

// D-039: Cancel deletes an open workout only, so a device still showing a workout another device finished cannot delete
// it; the refusal closes the Keep/Delete question and the toast says why.
test("Cancel on one device of a workout another device finished is refused, closes its question, and History keeps the workout", async ({ signedInPage: page, browser }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await logSet(page);
  const other = await otherDevice(browser, page);
  await andSettle(other, () => banner(other).getByRole("button", { name: "Resume" }).click());
  await expect(other.getByRole("timer", { name: "Workout time" })).toBeVisible();

  await andSettle(page, () => page.getByRole("button", { name: "Finish workout" }).click());
  await expect(page.getByText(/^Finished the workout/)).toBeVisible();
  await other.getByRole("button", { name: "Cancel workout" }).click();
  await andSettle(other, () => other.getByRole("button", { name: "Delete", exact: true }).click());
  await expect(toast(other, WORKOUT_ENDED_ELSEWHERE)).toBeVisible();
  await expect(other.getByText("Delete this workout and its sets?")).toBeHidden();
  await expect(other.getByRole("button", { name: "Cancel workout" })).toBeHidden();
  await expect(other.getByText("Cancelled the workout")).toBeHidden();
  expect(await setCount(await signedInUserId(page))).toBe(1);
  await other.context().close();

  await openGym(page);
  await expect(history(page).getByText("1 workout", { exact: true })).toBeVisible();
});

// D-046: the Undo of "Started" deletes the workout only while the server finds no set, so a set another device logged stays.
test("Undo of Started after another device logged a set is refused with the server's reason, and the set stays", async ({ signedInPage: page, browser }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  // Held under the mouse, the toast keeps its Undo while the other device works.
  await toast(page, `Started "${DAY}"`).hover();
  // This page's own refresh first: after the other device's set, a refresh would show it here.
  await refreshesDone(page);
  const other = await otherDevice(browser, page);
  await andSettle(other, () => banner(other).getByRole("button", { name: "Resume" }).click());
  await logSet(other);
  await expect(other.getByText(SET_LINE)).toBeVisible();
  await other.context().close();

  await andSettle(page, () => undoIn(page, `Started "${DAY}"`).click());
  await expect(toast(page, "Sets are logged; use Cancel workout instead.")).toBeVisible();
  // Read once the toast shows (its buttons render with it): a check that waits would pass once the toast runs out.
  expect(await toast(page, "Sets are logged; use Cancel workout instead.").getByRole("button", { name: "Retry" }).count()).toBe(0);
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeVisible();
  const userId = await signedInUserId(page);
  expect(await setCount(userId)).toBe(1);
  const { rows } = await asOwner((admin) => admin.query("SELECT duration_minutes FROM workout_sessions WHERE user_id = $1", [userId]));
  expect(rows).toEqual([{ duration_minutes: null }]);
});

// D-034: the open workout follows the server, so this page shows what another device did after its next refresh, with
// no reload: a pause, a set, and a Finish that takes the workout off the screen with a toast saying so.
test("a workout paused, logged into and finished on another device shows so here after a refresh, with no reload", async ({
  signedInPage: page,
  browser,
}) => {
  // The page's clock, so a focus can refresh it: a focus within 2 s of the last refresh refreshes nothing.
  await page.clock.install();
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await page.getByRole("button", { name: `Show ${EXERCISE}`, exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  const refresh = async () => {
    await refreshesDone(page);
    await page.clock.runFor(2000);
    const refreshed = page.waitForResponse((r) => isRefresh(page, r.request()));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await refreshed;
  };
  const other = await otherDevice(browser, page);
  try {
    await andSettle(other, () => banner(other).getByRole("button", { name: "Resume" }).click());
    // Ends Resume's tap burst (D-043): Pause may sit where the banner's Resume was.
    await other.keyboard.press("Shift");
    await andSettle(other, () => other.getByRole("button", { name: "Pause", exact: true }).click());
    await logSet(other);
    await expect(other.getByText("Added set 1")).toBeVisible();

    await refresh();
    await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
    await expect(page.getByText(SET_LINE)).toBeVisible();

    await andSettle(other, () => other.getByRole("button", { name: "Finish workout" }).click());
    await expect(other.getByText(/^Finished the workout/)).toBeVisible();
    await refresh();
    await expect(toast(page, WORKOUT_ENDED_ELSEWHERE)).toBeVisible();
    await expect(page.getByRole("timer", { name: "Workout time" })).toBeHidden();
    await expect(banner(page)).toBeHidden();
    await expect(history(page).getByText("1 workout", { exact: true })).toBeVisible();
  } finally {
    await other.context().close();
  }
});

// D-039: the timer lives on the workout row, so every page shows the same time.
test("a workout paused in one page shows the same paused time in another after its refresh", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  // Two minutes already counted, so a time of 0:00 cannot match by chance.
  const userId = await signedInUserId(page);
  await asOwner((admin) =>
    admin.query("UPDATE workout_sessions SET timer_running_since = timer_running_since - interval '125 seconds' WHERE user_id = $1", [userId]),
  );
  const other = await page.context().newPage();
  await openGym(other);
  await expect(banner(other)).toBeVisible();

  await andSettle(page, () => page.getByRole("button", { name: "Pause", exact: true }).click());
  await expect(page.getByText("Paused the timer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await openGym(other);
  const sub = banner(other).getByText(/· 0 sets logged · 2:\d\d$/);
  await expect(sub).toBeVisible();
  const shown = (await sub.textContent())!.split(" · ").pop()!;
  await expect(page.getByRole("timer", { name: "Workout time" })).toHaveText(shown);
  await other.close();
});

// D-039: a workout finished with no sets is deleted, and its Undo brings it back open.
test("finishing a workout with no sets removes it, with an Undo that brings it back, also after a reload", async ({ signedInPage: page }) => {
  const removed = "No sets logged: the workout was removed";
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await andSettle(page, () => page.getByRole("button", { name: "Finish workout" }).click());
  await expect(page.getByText(removed)).toBeVisible();
  await expect(page.getByText("No finished workouts yet.")).toBeVisible();
  await andSettle(page, () => undoIn(page, removed).click());
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeVisible();
  await openGym(page);
  await expect(banner(page).getByText(`${DAY} · 0 sets logged`)).toBeVisible();

  // Finished again with no sets: nothing is left after a reload.
  await andSettle(page, () => banner(page).getByRole("button", { name: "Resume" }).click());
  await andSettle(page, () => page.getByRole("button", { name: "Finish workout" }).click());
  await expect(page.getByText(removed)).toBeVisible();
  await openGym(page);
  await expect(banner(page)).toBeHidden();
  await expect(page.getByText("No finished workouts yet.")).toBeVisible();
});

// A double tap, counting the clicks that reach the page's document. The guard stops the rest of a tap burst on the
// window, before that, so a swallowed second tap is not counted whatever took the button's place (on this layout an
// exercise's header after Start, a muscle tag after Finish: neither writes, so the write count alone would not tell).
async function guardedBurst(page: Page, button: Locator) {
  await page.evaluate(() => {
    const w = window as unknown as { clicks?: number };
    if (w.clicks === undefined) document.addEventListener("click", () => w.clicks!++, true);
    w.clicks = 0;
  });
  const writes = await stillBurst(page, center(await button.boundingBox()));
  return { writes, clicks: await page.evaluate(() => (window as unknown as { clicks: number }).clicks) };
}

// Start and Finish act once per tap burst (D-043): the second tap neither writes again nor lands on what took the
// button's place.
test("a double tap on Start or on Finish writes once", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openGym(page);
  await pickDay(page, DAY);
  const start = page.getByRole("region", { name: "Training days" }).getByRole("button", { name: `Start ${DAY}`, exact: true });
  expect(await guardedBurst(page, start)).toEqual({ writes: 1, clicks: 1 });
  await expect(page.getByText(`Started "${DAY}"`)).toBeVisible();
  await dismissToast(page, `Started "${DAY}"`);
  await logSet(page);
  await dismissToast(page, "Added set 1");

  const finish = page.getByRole("button", { name: "Finish workout" });
  await finish.scrollIntoViewIfNeeded();
  expect(await guardedBurst(page, finish)).toEqual({ writes: 1, clicks: 1 });
  await expect(page.getByText(/^Finished the workout/)).toBeVisible();
  await expect(history(page).getByText("1 workout", { exact: true })).toBeVisible();
});

// D-040: the day's Save toast names the day's row, so a newer save of the day takes the older Undo away. The page's
// clock stands still from the first save on and moves 1 s only, for the refresh, so neither toast runs out.
test("a second save of a day takes the first save's Undo away", async ({ signedInPage: page }) => {
  const id = randomUUID().slice(0, 8);
  const [first, second] = [`Upper ${id} one`, `Upper ${id} two`];
  await page.clock.install();
  await openGym(page);
  const editor = await openEditor(page);
  await editor.getByLabel("Name", { exact: true }).fill(first);
  await pauseClock(page);
  await andSettle(page, () => editor.getByRole("button", { name: "Save" }).click(), `"name":"${first}"`);
  await expect(editor).toBeHidden();
  await expect(undoIn(page, `Saved "${first}"`)).toBeVisible();
  await page.keyboard.press("Shift"); // ends the Save's tap burst (D-043)
  await page.clock.runFor(1000); // the refresh that shows the day's new name

  await page.getByRole("button", { name: `Edit ${first}` }).click();
  await expect(editor).toBeVisible();
  await editor.getByLabel("Name", { exact: true }).fill(second);
  await andSettle(page, () => editor.getByRole("button", { name: "Save" }).click(), `"name":"${second}"`);
  await expect(editor).toBeHidden();
  await expect(undoIn(page, `Saved "${second}"`)).toBeVisible();
  await expectToastWithoutUndo(page, `Saved "${first}"`);
});

// A save refused because an exercise of the day was deleted elsewhere leaves the editor open; after the page's refresh
// (which no longer lists that exercise) the row still shows the name the user knows.
test("a day save refused for an exercise deleted elsewhere keeps that row's name", async ({ signedInPage: page }) => {
  const name = exerciseName();
  await openGym(page);
  const editor = await openEditor(page);
  await createExercise(page, editor, name, 8);
  await andSettle(page, () => editor.getByRole("button", { name: "Save" }).click(), `"name":"${DAY}"`);
  await expect(editor).toBeHidden();
  await page.keyboard.press("Shift"); // ends the Save's tap burst (D-043)
  // The routine has the row once the refresh is in: the editor opens with the day as the page holds it.
  await expect(page.getByRole("region", { name: DAY }).getByText(`8. ${name}`)).toBeVisible();

  await openEditor(page);
  await expect(editor.getByText(`8. ${name}`)).toBeVisible();
  await expect(mine(page).getByText(name, { exact: true })).toBeVisible();
  await asOwner(async (admin) => {
    await admin.query("DELETE FROM workout_split_day_exercises WHERE exercise_id IN (SELECT id FROM exercises WHERE name = $1)", [name]);
    await admin.query("DELETE FROM exercises WHERE name = $1", [name]);
  });
  await andSettle(page, () => editor.getByRole("button", { name: "Save" }).click(), `"name":"${DAY}"`);
  await expect(editor.getByText("An exercise on this day no longer exists. Remove it and save again.")).toBeVisible();
  // "My exercises", behind the editor, comes from the server: the refresh after the refusal is on screen.
  await expect(mine(page).getByText(name, { exact: true })).toBeHidden();
  await expect(editor.getByText(`8. ${name}`)).toBeVisible();
  await expect(editor.getByRole("button", { name: `Remove ${name}` })).toBeVisible();
});

// D-039: one workout per date. Start on another day while today has one is refused, and the screen never shows today's
// workout under the day that was tapped.
test("Start on another day after today's workout is finished is refused, and the screen stays as it was, also after a reload", async ({ signedInPage: page }) => {
  const other = "Legs (hamstrings)";
  const refused = `Today already has a workout: "${DAY}". Pick that day to keep going.`;
  await openGym(page);
  await startWorkout(page, DAY);
  await logSet(page);
  await andSettle(page, () => page.getByRole("button", { name: "Finish workout" }).click());
  await expect(page.getByText(/^Finished the workout/)).toBeVisible();

  await andSettle(page, () => page.getByRole("region", { name: "Training days" }).getByRole("button", { name: `Start ${other}`, exact: true }).click());
  await expect(page.getByText(refused)).toBeVisible();
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Finish workout" })).toBeHidden();
  await expect(history(page).getByText("1 workout", { exact: true })).toBeVisible();
  await openGym(page);
  await expect(banner(page)).toBeHidden();
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeHidden();
  await expect(history(page).getByText("1 workout", { exact: true })).toBeVisible();
  const userId = await signedInUserId(page);
  const { rows } = await asOwner((admin) =>
    admin.query("SELECT d.name, s.duration_minutes IS NOT NULL AS finished FROM workout_sessions s JOIN workout_split_days d ON d.id = s.split_day_id WHERE s.user_id = $1", [userId]),
  );
  expect(rows).toEqual([{ name: DAY, finished: true }]);
});

// D-040, D-047: an Undo the server refuses says why, in the server's words, with no Retry: the server has answered.
test("Undo of a workout removed for having no sets, refused because another device started one, shows the server's reason", async ({ signedInPage: page, browser }) => {
  const removed = "No sets logged: the workout was removed";
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await andSettle(page, () => page.getByRole("button", { name: "Finish workout" }).click());
  await expect(page.getByText(removed)).toBeVisible();
  // This page's own refresh first: after the other device's Start, a refresh would show its workout here.
  await refreshesDone(page);
  const other = await otherDevice(browser, page);
  await startWorkout(other, DAY);
  await other.context().close();

  await andSettle(page, () => undoIn(page, removed).click());
  const warning = toast(page, "A workout is already open. Resume or finish it first.");
  await expect(warning).toBeVisible();
  expect(await warning.getByRole("button", { name: "Retry" }).count()).toBe(0);
  await expect(page.getByText("Failed to restore the workout")).toBeHidden();
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeHidden();
});

// Finish removes a workout whose sets were all deleted on another device; its Undo brings the workout back with none of them.
test("Undo of a workout removed on Finish because another device deleted its sets brings it back with no sets", async ({ signedInPage: page, browser }) => {
  const removed = "No sets logged: the workout was removed";
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await logSet(page);
  await expect(page.getByText(SET_LINE)).toBeVisible();
  // This page's own refresh first: after the other device's delete, a refresh would take the set off this page.
  await refreshesDone(page);
  const other = await otherDevice(browser, page);
  await andSettle(other, () => banner(other).getByRole("button", { name: "Resume" }).click());
  await other.getByRole("button", { name: `Show ${EXERCISE}`, exact: true }).click();
  await andSettle(other, () => other.getByRole("button", { name: `Delete set 1 of ${EXERCISE}` }).click());
  await expect(other.getByText("Removed set 1")).toBeVisible();
  await other.context().close();

  await andSettle(page, () => page.getByRole("button", { name: "Finish workout" }).click());
  await expect(page.getByText(removed)).toBeVisible();
  await andSettle(page, () => undoIn(page, removed).click());
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeVisible();
  await expect(page.getByText(SET_LINE)).toBeHidden();
  expect(await setCount(await signedInUserId(page))).toBe(0);
  await openGym(page);
  await expect(banner(page).getByText(`${DAY} · 0 sets logged`)).toBeVisible();
});

// D-040: a newer change to the workout takes the Undo away from the older toasts that touch it. The page's clock stands
// still from the start on, so no toast runs out.
test("Pause takes the Started toast's Undo away, and Resume the Paused toast's", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openGym(page);
  await pauseClock(page);
  await startWorkout(page, DAY);
  const started = `Started "${DAY}"`;
  await expect(undoIn(page, started)).toBeVisible();

  await andSettle(page, () => page.getByRole("button", { name: "Pause", exact: true }).click());
  await expect(undoIn(page, "Paused the timer")).toBeVisible();
  await expectToastWithoutUndo(page, started);
  await page.keyboard.press("Shift"); // ends the Pause's tap burst (D-043): Resume is on the same spot

  await andSettle(page, () => page.getByRole("button", { name: "Resume", exact: true }).click());
  await expect(undoIn(page, "Resumed the timer")).toBeVisible();
  await expectToastWithoutUndo(page, "Paused the timer");
});

// D-039: a finished workout takes no set changes, so Finish takes the Undo away from its sets' toasts. The page's clock
// stands still from the set on, so its toast does not run out.
test("Finish takes the Undo away from an Added set toast", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await pauseClock(page);
  await logSet(page);
  await expect(undoIn(page, "Added set 1")).toBeVisible();

  await andSettle(page, () => page.getByRole("button", { name: "Finish workout" }).click());
  await expect(undoIn(page, "Finished the workout")).toBeVisible();
  await expectToastWithoutUndo(page, "Added set 1");
});

const notes = (page: Page) => page.getByLabel("Session notes (optional)");

// GYMB-03: the notes are saved with the open workout, on leaving the field (with Undo) and before Exit or Finish.
test("the workout's notes are kept when leaving it, after a reload and on Finish, with Undo", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await notes(page).fill("Felt strong");
  await andSettle(page, () => page.getByRole("button", { name: "Exit, finish later" }).click(), "Felt strong");
  await expect(banner(page)).toBeVisible();
  await openGym(page);
  await andSettle(page, () => banner(page).getByRole("button", { name: "Resume" }).click());
  await expect(notes(page)).toHaveValue("Felt strong");

  // Leaving the field saves the change, and its Undo brings the earlier notes back.
  await notes(page).fill("Felt strong, slept badly");
  await andSettle(page, () => notes(page).blur(), "slept badly");
  await andSettle(page, () => undoIn(page, "Saved the notes").click());
  await expect(notes(page)).toHaveValue("Felt strong");
  await openGym(page);
  await andSettle(page, () => banner(page).getByRole("button", { name: "Resume" }).click());
  await expect(notes(page)).toHaveValue("Felt strong");

  // Finish saves notes typed and not saved yet.
  await logSet(page);
  await notes(page).fill("Felt strong, new best");
  await andSettle(page, () => page.getByRole("button", { name: "Finish workout" }).click(), "new best");
  await expect(page.getByText(/^Finished the workout/)).toBeVisible();
  const userId = await signedInUserId(page);
  const { rows } = await asOwner((admin) => admin.query("SELECT notes, duration_minutes IS NOT NULL AS finished FROM workout_sessions WHERE user_id = $1", [userId]));
  expect(rows).toEqual([{ notes: "Felt strong, new best", finished: true }]);
});

// Notes the server saves as none (only invisible characters) are no change: Exit, Finish and Cancel go on with nothing to save.
test("notes of only an invisible character do not stop Exit, Finish or Cancel", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await notes(page).fill("\u200B");
  await andSettle(page, () => page.getByRole("button", { name: "Exit, finish later" }).click());
  await expect(banner(page)).toBeVisible();

  await andSettle(page, () => banner(page).getByRole("button", { name: "Resume" }).click());
  await notes(page).fill("\u200B");
  await page.getByRole("button", { name: "Cancel workout" }).click();
  await andSettle(page, () => page.getByRole("button", { name: "Delete", exact: true }).click());
  await expect(page.getByText("Cancelled the workout")).toBeVisible();

  await startWorkout(page, DAY);
  await notes(page).fill("\u200B");
  await andSettle(page, () => page.getByRole("button", { name: "Finish workout" }).click());
  await expect(page.getByText("No sets logged: the workout was removed")).toBeVisible();
  await expect(page.getByText(NOTHING_TO_SAVE, { exact: true })).toBeHidden();
});

// The refresh the page sends after Cancel: the server renders it at once (`rendered` resolves then, with no workout
// open), and its answer reaches the page only after `release`; `stale()` is that refresh's request.
async function holdRefreshAfterCancel(page: Page) {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let done = () => {};
  const rendered = new Promise<void>((resolve) => (done = resolve));
  let stale: Request | undefined;
  await page.route(
    (url) => url.pathname === "/gym",
    async (route) => {
      if (stale || !isRefresh(page, route.request())) return route.fallback();
      stale = route.request();
      const answer = await route.fetch();
      done();
      await held;
      await route.fulfill({ response: answer });
    },
  );
  return { rendered, release, stale: () => stale! };
}

// D-034: Next sends a write without waiting for a refresh on its way, and applies that refresh once the write's own change
// is on screen. A refresh the server rendered before Start (no workout open) must not end the workout Start put on screen.
// The refresh after Cancel is rendered at once and its answer held until Start has answered.
test("a refresh rendered before Start and answered after it leaves the started workout on screen", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  // The page holds the open workout as the server sent it, so the held page (none open) is a change to it.
  await refreshesDone(page);
  await page.evaluate(headIsQuiet);
  await page.getByRole("button", { name: "Cancel workout" }).click();
  const { rendered, release, stale } = await holdRefreshAfterCancel(page);
  await andSettle(page, () => page.getByRole("button", { name: "Delete", exact: true }).click());
  await expect(page.getByText("Cancelled the workout")).toBeVisible();
  await rendered;
  await startWorkout(page, DAY);
  release();
  await stale().response();
  await refreshesDone(page);
  await page.evaluate(headIsQuiet);
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeVisible();
  await expect(toast(page, WORKOUT_ENDED_ELSEWHERE)).toBeHidden();
  await notes(page).fill("Still in hand");
});

// The same race with no request held: the refresh after Cancel (rendered before Start, with no write on its way) has
// fully arrived, and Start is tapped a few ms after Next takes it, before it is on screen.
for (const ms of [1, 2, 4]) {
  test(`Start tapped ${ms} ms after a refresh rendered before it has arrived leaves the started workout on screen`, async ({ signedInPage: page }) => {
    // Under the app's own fetch: the next refresh, once armed, is read whole and handed on when the test says, and
    // Start is tapped `ms` after that (the moment is the case under test, not a wait).
    await page.addInitScript(() => {
      const realFetch = window.fetch;
      const trap: { armed: boolean; arrived: boolean; go?: (ms: number) => void; start?: HTMLElement } = { armed: false, arrived: false };
      Object.assign(window, { trap });
      window.fetch = async (input, init) => {
        const res = await realFetch(input, init);
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (trap.armed && headers.has("rsc") && !headers.has("next-router-prefetch") && !headers.has("next-router-segment-prefetch")) {
          trap.armed = false;
          await res.clone().arrayBuffer();
          const after = await new Promise<number>((go) => {
            trap.go = go;
            trap.arrived = true;
          });
          setTimeout(() => trap.start?.click(), after);
        }
        return res;
      };
    });
    type Trap = { trap: { armed: boolean; arrived: boolean; go: (ms: number) => void; start: HTMLElement } };
    await openGym(page);
    await startWorkout(page, DAY);
    await refreshesDone(page);
    await page.evaluate(headIsQuiet);
    await page.getByRole("button", { name: "Cancel workout" }).click();
    await page.evaluate(() => ((window as unknown as Trap).trap.armed = true));
    await andSettle(page, () => page.getByRole("button", { name: "Delete", exact: true }).click());
    await expect(page.getByText("Cancelled the workout")).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as Trap).trap.arrived)).toBe(true);
    await page
      .getByRole("region", { name: "Training days" })
      .getByRole("button", { name: `Start ${DAY}`, exact: true })
      .evaluate((button) => ((window as unknown as Trap).trap.start = button as HTMLElement));
    await andSettle(page, () => page.evaluate((after) => (window as unknown as Trap).trap.go(after), ms));
    await refreshesDone(page);
    await page.evaluate(headIsQuiet);
    await expect(page.getByRole("timer", { name: "Workout time" })).toBeVisible();
    await expect(toast(page, WORKOUT_ENDED_ELSEWHERE)).toBeHidden();
  });
}

// A refresh rendered before Start and answered after it while the device is offline: no newer refresh follows it, and the
// workout stays in hand, then and once the device is back online.
test("a refresh rendered before Start and answered after it, offline since, leaves the started workout in hand", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await refreshesDone(page);
  await page.evaluate(headIsQuiet);
  await page.getByRole("button", { name: "Cancel workout" }).click();
  const { rendered, release, stale } = await holdRefreshAfterCancel(page);
  await andSettle(page, () => page.getByRole("button", { name: "Delete", exact: true }).click());
  await expect(page.getByText("Cancelled the workout")).toBeVisible();
  await rendered;
  // Offline from Start's answer on: the refresh it leaves due waits for the network, so no refresh replaces the held one.
  let answered = false;
  await page.route(
    (url) => url.pathname === "/gym",
    async (route) => {
      if (answered || route.request().method() !== "POST") return route.fallback();
      answered = true;
      const answer = await route.fetch();
      await page.context().setOffline(true);
      await route.fulfill({ response: answer });
    },
  );
  await startWorkout(page, DAY);
  // Every page Next puts on screen replaces the tags it hoists into <head>: the held page is on screen once they change.
  const shown = page.evaluate(
    () => new Promise<void>((resolve) => new MutationObserver((_, seen) => (seen.disconnect(), resolve())).observe(document.head, { childList: true, subtree: true })),
  );
  release();
  await stale().response();
  await shown;
  await page.evaluate(headIsQuiet);
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeVisible();
  await expect(toast(page, WORKOUT_ENDED_ELSEWHERE)).toBeHidden();

  const refreshed = page.waitForResponse((r) => isRefresh(page, r.request()));
  await page.context().setOffline(false);
  await refreshed;
  await refreshesDone(page);
  await page.evaluate(headIsQuiet);
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeVisible();
  await expect(banner(page)).toBeHidden();
  await notes(page).fill("Still in hand");
});

// D-034: a workout finished on another device before this page's first refresh after Start (the page showed none open
// before Start, and shows none again) still leaves the screen, with the toast.
test("a workout finished on another device before the first refresh after Start leaves this page too", async ({ signedInPage: page, browser }) => {
  await openGym(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) => url.pathname === "/gym",
    async (route) => {
      if (isRefresh(page, route.request())) await held;
      await route.fallback();
    },
  );
  await startWorkout(page, DAY);
  const other = await otherDevice(browser, page);
  try {
    await andSettle(other, () => banner(other).getByRole("button", { name: "Resume" }).click());
    // Ends Resume's tap burst (D-043): Finish may sit where the banner's Resume was.
    await other.keyboard.press("Shift");
    await andSettle(other, () => other.getByRole("button", { name: "Finish workout" }).click());
    await expect(other.getByText("No sets logged: the workout was removed")).toBeVisible();
    release();
    await refreshesDone(page);
    await expect(toast(page, WORKOUT_ENDED_ELSEWHERE)).toBeVisible();
    await expect(page.getByRole("timer", { name: "Workout time" })).toBeHidden();
    await expect(banner(page)).toBeHidden();
  } finally {
    await other.context().close();
  }
});

// D-040, D-047: notes changed on another page refuse this page's save; the field then shows the server's notes and the
// text typed here (a space between them, as the field is one line), and the next save keeps both.
test("notes refused because another page changed them show the other page's notes before the text typed here, and the next try saves both", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  const other = await page.context().newPage();
  await openGym(other);
  await andSettle(other, () => banner(other).getByRole("button", { name: "Resume" }).click());
  await notes(other).fill("From the other page");
  await andSettle(other, () => notes(other).blur(), "From the other page");
  await expect(other.getByText("Saved the notes")).toBeVisible();
  await other.close();

  await notes(page).fill("From this page");
  await andSettle(page, () => notes(page).blur(), "From this page");
  await expect(toast(page, "These notes changed on another device. Check them and try again.")).toBeVisible();
  await expect(notes(page)).toHaveValue("From this page");
  // The refresh after the refusal brings the server's notes; React commits it a few tasks after its response.
  await refreshesDone(page);
  await page.evaluate(headIsQuiet);
  await expect(notes(page)).toHaveValue("From the other page From this page");
  // Only a workout that ended elsewhere leaves the screen on a refusal (D-039): this one stays in hand.
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeVisible();
  await expect(toast(page, WORKOUT_ENDED_ELSEWHERE)).toHaveCount(0);
  await andSettle(page, () => page.getByRole("button", { name: "Exit, finish later" }).click(), "From this page");
  await expect(banner(page)).toBeVisible();
  const userId = await signedInUserId(page);
  const { rows } = await asOwner((admin) => admin.query("SELECT notes FROM workout_sessions WHERE user_id = $1", [userId]));
  expect(rows).toEqual([{ notes: "From the other page From this page" }]);
});

// D-046: a refused Undo of "Saved the notes" takes the server's notes as the next save's start, as a refused save does.
test("Undo of saved notes refused because another page changed them leaves the next save free to go", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await notes(page).fill("From this page");
  await andSettle(page, () => notes(page).blur(), "From this page");
  // Held under the mouse, the toast keeps its Undo while the other page works.
  await toast(page, "Saved the notes").hover();
  const other = await page.context().newPage();
  await openGym(other);
  await andSettle(other, () => banner(other).getByRole("button", { name: "Resume" }).click());
  await expect(notes(other)).toHaveValue("From this page");
  await notes(other).fill("From the other page");
  await andSettle(other, () => notes(other).blur(), "From the other page");
  await expect(other.getByText("Saved the notes")).toBeVisible();
  await other.close();

  await andSettle(page, () => undoIn(page, "Saved the notes").click());
  await expect(toast(page, "These notes changed on another device. Check them and try again.")).toBeVisible();
  await expect(notes(page)).toHaveValue("From this page");
  // The refresh after the refusal brings the server's notes; React commits it a few tasks after its response.
  await refreshesDone(page);
  await page.evaluate(headIsQuiet);
  await notes(page).fill("Second try");
  await andSettle(page, () => page.getByRole("button", { name: "Exit, finish later" }).click(), "Second try");
  await expect(banner(page)).toBeVisible();
  const userId = await signedInUserId(page);
  const { rows } = await asOwner((admin) => admin.query("SELECT notes FROM workout_sessions WHERE user_id = $1", [userId]));
  expect(rows).toEqual([{ notes: "Second try" }]);
});

// Server notes another device saved, written straight to the database: this page's next notes save is refused.
async function setServerNotes(page: Page, value: string) {
  const userId = await signedInUserId(page);
  await asOwner((admin) => admin.query("UPDATE workout_sessions SET notes = $2 WHERE user_id = $1", [userId, value]));
}

// Blurs the notes field holding `typed`: the save is refused with NOTES_CHANGED, and the refresh after it reaches the field.
async function refusedNotes(page: Page, typed: string) {
  await notes(page).fill(typed);
  await andSettle(page, () => notes(page).blur(), typed);
  await expect(toast(page, NOTES_CHANGED)).toBeVisible();
  // React commits the refresh a few tasks after its response.
  await refreshesDone(page);
  await page.evaluate(headIsQuiet);
}

// Exits the workout (which saves the field) and checks the saved row.
async function exitSaves(page: Page, saved: string) {
  await andSettle(page, () => page.getByRole("button", { name: "Exit, finish later" }).click(), saved);
  await expect(banner(page)).toBeVisible();
  const userId = await signedInUserId(page);
  const { rows } = await asOwner((admin) => admin.query("SELECT notes FROM workout_sessions WHERE user_id = $1", [userId]));
  expect(rows).toEqual([{ notes: saved }]);
}

// D-047: after a NOTES_CHANGED refusal the field puts the server's notes first only when it does not hold them already,
// so the text is never doubled: neither when the field was typed on top of them, nor on a second refusal after the
// merged text was saved elsewhere.
test("notes refused while the field already holds the server's notes are not doubled", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await refreshesDone(page);
  await setServerNotes(page, "Shared");
  await refusedNotes(page, "Shared and more");
  await expect(notes(page)).toHaveValue("Shared and more");
  await exitSaves(page, "Shared and more");
});

test("a second notes refusal after the merged notes were saved elsewhere does not double them", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await refreshesDone(page);
  await setServerNotes(page, "X");
  await refusedNotes(page, "Mine");
  await expect(notes(page)).toHaveValue("X Mine");
  await dismissToast(page, NOTES_CHANGED);
  // Another device saves the merged text; this page adds more and is refused again.
  await setServerNotes(page, "X Mine");
  await refusedNotes(page, "X Mine more");
  await expect(notes(page)).toHaveValue("X Mine more");
  await exitSaves(page, "X Mine more");
});

// Notes the server takes as over its limit, typed past the field's own limit (an older page, a paste the field let by).
async function typeTooLong(page: Page, start = "") {
  await notes(page).evaluate((field) => field.removeAttribute("maxlength"));
  await notes(page).fill(start + "x".repeat(GYM_LIMITS.sessionNotes + 1));
}

// Notes another page saved meanwhile, so this page's next notes save is refused with NOTES_CHANGED.
async function notesChangedElsewhere(page: Page) {
  const other = await page.context().newPage();
  await openGym(other);
  await andSettle(other, () => banner(other).getByRole("button", { name: "Resume" }).click());
  await notes(other).fill("From the other page");
  await andSettle(other, () => notes(other).blur(), "From the other page");
  await other.close();
}

// A notes refusal that does not end the workout is told once when Exit follows the tap's blur: Exit's own notes save is
// the same text, so it sends nothing again, and the workout stays in hand. The page's clock stands still from Exit on and
// moves 200 ms at a time only while the refreshes after the writes are due, so the toasts (5 s) are still there to count
// however slow the machine is.
const NOT_ENDING: { refusal: string; error: string; type: (page: Page) => Promise<void> }[] = [
  { refusal: "over the limit", error: `Too long (max ${GYM_LIMITS.sessionNotes})`, type: (page) => typeTooLong(page) },
  {
    refusal: "changed on another page",
    error: NOTES_CHANGED,
    type: async (page) => {
      await notesChangedElsewhere(page);
      await notes(page).fill("From this page");
    },
  },
];
for (const { refusal, error, type } of NOT_ENDING) {
  test(`notes refused as ${refusal} on Exit are told once, and the workout stays`, async ({ signedInPage: page }) => {
    await page.clock.install();
    await openGym(page);
    await startWorkout(page, DAY);
    await dismissToast(page, `Started "${DAY}"`);
    await type(page);
    await pauseClock(page);
    const writes = countWrites(page);

    await andSettle(page, () => page.getByRole("button", { name: "Exit, finish later" }).click());
    await refreshesDone(page, { tick: 200 });
    await expect(toast(page, error)).toHaveCount(1);
    expect(writes).toHaveLength(1);
    await expect(page.getByRole("timer", { name: "Workout time" })).toBeVisible();
    await expect(banner(page)).toBeHidden();
  });
}

// A refusal that does not end the workout keeps it in hand (D-039), so a save already waiting behind the refused one still
// goes: the over-the-limit notes are held on their way while the field is changed and Exit tapped.
test("a notes save waiting behind a refusal that does not end the workout is sent, and Exit goes on", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await typeTooLong(page, "Held ");
  const release = await holdWrites(page, "Held ");
  await notes(page).blur();
  await notes(page).fill("Second try");

  await page.getByRole("button", { name: "Exit, finish later" }).click();
  await release();
  await expect(banner(page)).toBeVisible();
  await expect(toast(page, `Too long (max ${GYM_LIMITS.sessionNotes})`)).toHaveCount(1);
  await expect(toast(page, "Saved the notes")).toHaveCount(1);
  const userId = await signedInUserId(page);
  const { rows } = await asOwner((admin) => admin.query("SELECT notes FROM workout_sessions WHERE user_id = $1", [userId]));
  expect(rows).toEqual([{ notes: "Second try" }]);
});

// GYMB-05: Undo of "Added set" after another device deleted that set leaves nothing behind, not a row that is not saved.
test("Undo of an added set another device already deleted adds no row back", async ({ signedInPage: page, browser }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await logSet(page);
  await expect(undoIn(page, "Added set 1")).toBeVisible();
  // This page's own refresh first: after the other device's delete, a refresh would take the set off this page.
  await refreshesDone(page);
  const other = await otherDevice(browser, page);
  await andSettle(other, () => banner(other).getByRole("button", { name: "Resume" }).click());
  await other.getByRole("button", { name: `Show ${EXERCISE}`, exact: true }).click();
  await andSettle(other, () => other.getByRole("button", { name: `Delete set 1 of ${EXERCISE}` }).click());
  await expect(other.getByText("Removed set 1")).toBeVisible();
  await other.context().close();

  await andSettle(page, () => undoIn(page, "Added set 1").click());
  // A set logged next is the only row: the deleted one did not come back.
  await page.getByLabel("Value").fill("70");
  await andSettle(page, () => page.getByRole("button", { name: "Log set" }).click());
  await expect(page.getByText(/Set 1: 5 × 70 kg/)).toBeVisible();
  await expect(page.getByText(SET_LINE)).toBeHidden();
  expect(await setCount(await signedInUserId(page))).toBe(1);
});

// D-046: Undo of a deleted set whose number a set logged meanwhile took shows it under the number the server gave it.
test("Undo of a deleted set 3 after a new set 3 was logged shows it as set 4, without a reload", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await logSet(page);
  for (const kg of ["60", "70"]) {
    await page.getByLabel("Value").fill(kg);
    await page.keyboard.press("Shift"); // ends the last tap's burst (D-043)
    await andSettle(page, () => page.getByRole("button", { name: "Log set" }).click());
  }
  await expect(page.getByText(/Set 3: 5 × 70 kg/)).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: `Delete set 3 of ${EXERCISE}` }).click());
  await expect(page.getByText(/Set 3: 5 × 70 kg/)).toBeHidden();
  await page.getByLabel("Value").fill("80");
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: "Log set" }).click());
  await expect(page.getByText(/Set 3: 5 × 80 kg/)).toBeVisible();

  await andSettle(page, () => undoIn(page, "Removed set 3").click());
  await expect(page.getByText(/Set 4: 5 × 70 kg/)).toBeVisible();
  await expect(page.getByText(/Set 3: 5 × 80 kg/)).toBeVisible();
  await expect(page.getByText(/Set 3: 5 × 70 kg/)).toBeHidden();
  const userId = await signedInUserId(page);
  const { rows } = await asOwner((admin) =>
    admin.query(
      "SELECT ws.set_order, ws.load_value FROM workout_sets ws JOIN workout_sessions s ON s.id = ws.session_id WHERE s.user_id = $1 ORDER BY ws.set_order",
      [userId],
    ),
  );
  expect(rows).toEqual([
    { set_order: 1, load_value: "60.00" },
    { set_order: 2, load_value: "60.00" },
    { set_order: 3, load_value: "80.00" },
    { set_order: 4, load_value: "70.00" },
  ]);
});

// D-047: the set leaves and its toast shows at once; a delete whose answer is lost puts the set back and takes the
// toast away. The page's clock stands still, so the toast cannot have run out by itself.
test("a set delete whose answer is lost takes its Removed set toast away and puts the set back", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await logSet(page);
  await dismissToast(page, "Added set 1");
  await refreshesDone(page, { tick: 1000 });
  await pauseClock(page);
  const release = await holdWrites(page);
  await page.getByRole("button", { name: `Delete set 1 of ${EXERCISE}` }).click();
  await expect(page.getByText(SET_LINE)).toBeHidden();
  await expect(toast(page, "Removed set 1")).toBeVisible();
  await release(true);
  await expect(page.getByText(SET_LINE)).toBeVisible();
  await expect(toast(page, "Removed set 1")).toHaveCount(0);
  expect(await setCount(await signedInUserId(page))).toBe(1);
});

// D-046, D-047: a set already gone from the server (another device deleted it) counts as removed: the set stays off
// the screen and its toast stays, with its Undo, and no failure shows. The page's clock stands still, so the toast
// cannot have run out by itself.
test("a set delete answered that the set is gone keeps its Removed set toast", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await logSet(page);
  await dismissToast(page, "Added set 1");
  await refreshesDone(page, { tick: 1000 });
  await pauseClock(page);
  const userId = await signedInUserId(page);
  await asOwner((admin) =>
    admin.query("DELETE FROM workout_sets WHERE session_id IN (SELECT id FROM workout_sessions WHERE user_id = $1)", [userId]),
  );
  await andSettle(page, () => page.getByRole("button", { name: `Delete set 1 of ${EXERCISE}` }).click());
  await expect(page.getByText(SET_LINE)).toBeHidden();
  await expect(undoIn(page, "Removed set 1")).toBeVisible();
  await expect(page.locator(".toast-item")).toHaveCount(1);
  expect(await setCount(userId)).toBe(0);
});

// D-047: a refused Undo of a set delete says the server's reason, with no Retry (a Retry is only for an answer that
// never came).
test("Undo of a deleted set refused because the workout was finished elsewhere shows the server's reason", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await logSet(page);
  await dismissToast(page, "Added set 1");
  await andSettle(page, () => page.getByRole("button", { name: `Delete set 1 of ${EXERCISE}` }).click());
  // Held under the mouse, the toast keeps its Undo while the workout is finished elsewhere; the page's own refresh is
  // done first, so it cannot take the workout off the screen.
  await toast(page, "Removed set 1").hover();
  await refreshesDone(page);
  const userId = await signedInUserId(page);
  await asOwner((admin) => admin.query("UPDATE workout_sessions SET duration_minutes = 1 WHERE user_id = $1", [userId]));
  await andSettle(page, () => undoIn(page, "Removed set 1").click());
  await expect(toast(page, WORKOUT_FINISHED)).toBeVisible();
  expect(await toast(page, WORKOUT_FINISHED).getByRole("button", { name: "Retry" }).count()).toBe(0);
  expect(await setCount(userId)).toBe(0);
});

// GYMB-07, GYMB-08, GYMB-18: the set form says why a value cannot be logged, and each new set starts with the checks off.
test("the set form explains a value it refuses, and each new set starts with its checks unchecked", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await page.getByRole("button", { name: `Show ${EXERCISE}`, exact: true }).click();
  const log = page.getByRole("button", { name: "Log set" });
  const value = page.getByLabel("Value");

  await value.fill("-5");
  await expect(page.getByText("Can't be negative")).toBeVisible();
  await expect(log).toBeDisabled();
  await value.fill("0");
  await expect(page.getByText(ZERO_LOAD, { exact: true })).toBeVisible();
  await expect(log).toBeDisabled();
  await value.fill("2,555");
  await expect(page.getByText(TWO_DECIMALS, { exact: true })).toBeVisible();
  await expect(log).toBeDisabled();
  await page.getByLabel("Unit").selectOption("bodyweight");
  await value.fill("0");
  await expect(page.getByText(ZERO_LOAD, { exact: true })).toBeHidden();
  await expect(log).toBeEnabled();
  await page.getByLabel("Unit").selectOption("kg");

  for (const check of ["True failure (0 RIR)", "Partial reps at end", "Good form"]) await expect(page.getByLabel(check)).not.toBeChecked();
  await page.getByLabel("True failure (0 RIR)").check();
  await page.getByLabel("Good form").check();
  await value.fill("60");
  await andSettle(page, () => log.click());
  await expect(page.getByText(SET_LINE)).toBeVisible();
  for (const check of ["True failure (0 RIR)", "Partial reps at end", "Good form"]) await expect(page.getByLabel(check)).not.toBeChecked();
  await expect(value).toHaveValue("60");
  const userId = await signedInUserId(page);
  const { rows } = await asOwner((admin) =>
    admin.query("SELECT ws.is_failure, ws.is_good_form FROM workout_sets ws JOIN workout_sessions s ON s.id = ws.session_id WHERE s.user_id = $1", [userId]),
  );
  expect(rows).toEqual([{ is_failure: true, is_good_form: true }]);
});

// GYMC-09 (D-038): a set more than 50% above the exercise's best is logged on a second tap.
test("a set far above the exercise's best asks for a second tap before it is logged", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await logSet(page);
  await dismissToast(page, "Added set 1");
  const userId = await signedInUserId(page);

  await page.getByLabel("Value").fill("100");
  const log = page.getByRole("button", { name: "Log set" });
  await log.click();
  const ask = page.getByText("Much more than your best (60 kg). Tap again to log.");
  await expect(ask).toBeVisible();
  await settled(page);
  expect(await setCount(userId)).toBe(1);
  await page.keyboard.press("Shift"); // ends the first tap's burst (D-043)
  await andSettle(page, () => log.click());
  await expect(page.getByText("Added set 2")).toBeVisible();
  await expect(page.getByText(/Set 2: 5 × 100 kg/)).toBeVisible();
  await expect(ask).toBeHidden();
  expect(await setCount(userId)).toBe(2);

  // Within 50% of the best (now 100 kg) it is one tap.
  await page.getByLabel("Value").fill("150");
  await page.keyboard.press("Shift");
  await andSettle(page, () => log.click());
  await expect(page.getByText("Added set 3")).toBeVisible();
});

// GYMB-04 (D-043): Log set and a set's Delete act once per tap burst.
test("a double tap on Log set or on a set's Delete writes once", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await page.getByRole("button", { name: `Show ${EXERCISE}`, exact: true }).click();
  await page.getByLabel("Value").fill("60");
  // The first set's row pushes the button down, so a second tap that got through would land on the form above it.
  expect(await guardedBurst(page, page.getByRole("button", { name: "Log set" }))).toEqual({ writes: 1, clicks: 1 });
  await expect(page.getByText(SET_LINE)).toBeVisible();
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: "Log set" }).click());
  await expect(page.getByText(/Set 2: 5 × 60 kg/)).toBeVisible();
  await page.keyboard.press("Shift");

  // Set 2's Delete slides up under the second tap.
  await page.addStyleTag({ content: "* { overflow-anchor: none }" });
  expect(await guardedBurst(page, page.getByRole("button", { name: `Delete set 1 of ${EXERCISE}` }))).toEqual({ writes: 1, clicks: 1 });
  await expect(page.getByText(SET_LINE)).toBeHidden();
  await expect(page.getByText(/Set 2: 5 × 60 kg/)).toBeVisible();
  expect(await setCount(await signedInUserId(page))).toBe(1);
});

// GYMB-02 (D-040): the server numbers a set, so two pages logging into one workout never repeat a number.
test("sets logged from two pages into one workout are numbered in turn", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await logSet(page);
  await dismissToast(page, "Added set 1");
  const other = await page.context().newPage();
  await openGym(other);
  await andSettle(other, () => banner(other).getByRole("button", { name: "Resume" }).click());
  await logSet(other);
  await expect(other.getByText("Added set 2")).toBeVisible();
  await other.close();

  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: "Log set" }).click());
  await expect(page.getByText("Added set 3")).toBeVisible();
  await openGym(page);
  await andSettle(page, () => banner(page).getByRole("button", { name: "Resume" }).click());
  await page.getByRole("button", { name: `Show ${EXERCISE}`, exact: true }).click();
  for (const n of [1, 2, 3]) await expect(page.getByText(new RegExp(`Set ${n}: 5 × 60 kg`))).toBeVisible();
});

// GYMB-10: an exercise taken off the day while its workout is open keeps its logged sets on screen.
test("an exercise taken off the day keeps its logged sets in the open workout", async ({ signedInPage: page }) => {
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await logSet(page);
  await dismissToast(page, "Added set 1");
  await andSettle(page, () => page.getByRole("button", { name: "Exit, finish later" }).click());
  await expect(banner(page)).toBeVisible();

  const editor = await openEditor(page);
  await editor.getByRole("button", { name: `Remove ${EXERCISE}` }).click();
  await andSettle(page, () => editor.getByRole("button", { name: "Save" }).click(), `"name":"${DAY}"`);
  await expect(editor).toBeHidden();
  await expect(page.getByRole("region", { name: DAY }).getByText(EXERCISE)).toBeHidden();
  await andSettle(page, () => banner(page).getByRole("button", { name: "Resume" }).click());
  // Still open, as it was left, now after the day's exercises.
  await expect(page.getByRole("button", { name: `Show ${EXERCISE}`, exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(SET_LINE)).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: `Delete set 1 of ${EXERCISE}` }).click());
  await expect(page.getByText("Removed set 1")).toBeVisible();
  expect(await setCount(await signedInUserId(page))).toBe(0);
});

// B2b: the workout on screen is the one the server answered, never just the day that was tapped. Start's answer is
// changed on its way to name another day, which the screen must then show.
test("Start shows the day of the server's answer, not the day that was tapped", async ({ signedInPage: page }) => {
  const other = "Legs (hamstrings)";
  await openGym(page);
  const userId = await signedInUserId(page);
  const ids = Object.fromEntries(
    (await asOwner((admin) => admin.query("SELECT name, id FROM workout_split_days WHERE user_id = $1 AND name = ANY($2)", [userId, [DAY, other]]))).rows.map(
      (r) => [r.name, r.id],
    ),
  );
  await page.route("**/gym", async (route) => {
    const body = route.request().postData() ?? "";
    if (route.request().method() !== "POST" || !body.includes('"splitDayId"') || !body.includes('"isDeload"')) return route.fallback();
    const answer = await route.fetch();
    const text = (await answer.text()).replaceAll(ids[DAY], ids[other]).replaceAll(JSON.stringify(DAY), JSON.stringify(other));
    // The body is read decoded and changed, so its length and encoding headers no longer apply.
    const headers = Object.fromEntries(Object.entries(answer.headers()).filter(([k]) => !["content-length", "content-encoding", "transfer-encoding"].includes(k)));
    await route.fulfill({ response: answer, body: text, headers });
  });
  await pickDay(page, DAY);
  await startWorkout(page, DAY);
  await expect(page.getByRole("region", { name: other })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show Seated/lying hamstring curl", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Show ${EXERCISE}`, exact: true })).toBeHidden();
});

// Step 13 (D-038): past workouts are written straight to the database, on dates counted from the app's day (the app's
// time zone, like the server), so the progress figures have weeks to compare.
type PastSet = { date: string; exercise: string; loadType?: "kg" | "plates" | "bodyweight"; load: number; reps?: number; deload?: boolean };

// One finished workout of DAY per entry, with one set of a shared exercise; the page is opened first (it makes the split)
// and opened again after.
async function pastWorkouts(page: Page, workouts: PastSet[]) {
  await openGym(page);
  const userId = await signedInUserId(page);
  await asOwner(async (admin) => {
    const day = (await admin.query("SELECT id FROM workout_split_days WHERE user_id = $1 AND name = $2", [userId, DAY])).rows[0].id;
    for (const w of workouts) {
      const exercise = (await admin.query("SELECT id FROM exercises WHERE user_id IS NULL AND name = $1", [w.exercise])).rows[0].id;
      const session = (
        await admin.query("INSERT INTO workout_sessions (user_id, split_day_id, date, duration_minutes, is_deload) VALUES ($1, $2, $3, 50, $4) RETURNING id", [
          userId,
          day,
          w.date,
          w.deload ?? false,
        ])
      ).rows[0].id;
      await admin.query(
        "INSERT INTO workout_sets (session_id, user_id, exercise_id, set_order, reps, load_type, load_value) VALUES ($1, $2, $3, 1, $4, $5, $6)",
        [session, userId, exercise, w.reps ?? 8, w.loadType ?? "kg", w.load],
      );
    }
  });
  await openGym(page);
  return userId;
}

const progress = (page: Page) => page.getByRole("region", { name: /^Exercise progress/ });
const ROW = "Chest-supported row"; // a machine exercise, logged here in plates
const PULL_UPS = "Weighted pull-ups"; // a bodyweight exercise: its load is the kg it adds

// GYMC-04: with nothing logged the card keeps its title and its fold. GYMC-03: an exercise on two days with different
// targets shows each day's own. GYMC-01: a browser whose clock is a day ahead of the server renders the same page.
test("the progress card, the muscle map and History render the server's day, with no hydration warning", async ({ signedInPage: page }) => {
  const warnings = hydrationWarnings(page);
  await openGym(page);
  await expect(progress(page).getByRole("button", { name: "Show exercise progress" })).toBeVisible();
  await expect(progress(page).getByText("Log a workout to see your progress.")).toBeVisible();

  await pickDay(page, DAY);
  const map = page.getByRole("region", { name: /^Muscle map/ });
  await expect(map.getByRole("button", { name: "Biceps", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(map.getByText("Bayesian curl (high)", { exact: true })).toBeVisible();
  await expect(map.getByText(`${DAY} · 2 × 5 – 8`, { exact: true })).toBeVisible();
  await expect(map.getByText("Upper (back) · 2 × 8 – 10", { exact: true })).toBeVisible();

  // 89 days ago is still in the 90-day chart for the server; for a browser a day ahead it would not be.
  const today = toISODate();
  await pastWorkouts(page, [
    { date: addDays(today, -89), exercise: EXERCISE, load: 50 },
    { date: addDays(today, -10), exercise: EXERCISE, load: 60 },
  ]);
  await page.clock.install({ time: new Date(Date.now() + 86_400_000) });
  await openGym(page);
  await expect(progress(page).getByRole("img", { name: "Heaviest load (kg) of each workout over the last 90 days" })).toBeVisible();
  await expect(progress(page).getByText("50", { exact: true })).toBeVisible();
  await expect(history(page).getByText("2 workouts", { exact: true })).toBeVisible();
  await settled(page);
  expect(warnings).toEqual([]);
});

// GYMC-05: plate sets chart in plates until 1 plate has a weight, then in kg; the weight is saved per exercise, with Undo.
test("a signed-in user sets the weight of 1 plate, and the chart turns to kg, with Undo, also after a reload", async ({ signedInPage: page }) => {
  const today = toISODate();
  const userId = await pastWorkouts(page, [
    { date: addDays(today, -14), exercise: ROW, loadType: "plates", load: 6 },
    { date: addDays(today, -7), exercise: ROW, loadType: "plates", load: 7 },
  ]);
  const card = progress(page);
  await expect(card.getByText("1 plate: no weight yet")).toBeVisible();
  await expect(card.getByRole("img", { name: /^Heaviest load \(plates\)/ })).toBeVisible();
  await expect(card.getByText("7", { exact: true })).toBeVisible();

  const saved = `1 plate of ${ROW} = 10 kg`;
  const save = async () => {
    await card.getByRole("button", { name: `Edit 1 plate of ${ROW} in kg` }).click();
    const dialog = page.getByRole("dialog", { name: "Plate weight" });
    await dialog.getByLabel(`1 plate of ${ROW} (kg)`).fill("10");
    await andSettle(page, () => dialog.getByRole("button", { name: "Save" }).click());
    await expect(dialog).toBeHidden();
    await expect(toast(page, saved)).toBeVisible();
  };
  const weights = async () =>
    (await asOwner((admin) => admin.query("SELECT kg FROM exercise_plate_weights WHERE user_id = $1", [userId]))).rows.map((r) => r.kg);

  await save();
  await expect(card.getByText("1 plate = 10 kg")).toBeVisible();
  await expect(card.getByRole("img", { name: /^Heaviest load \(kg\)/ })).toBeVisible();
  await expect(card.getByText("70", { exact: true })).toBeVisible();
  expect(await weights()).toEqual(["10.00"]);

  // Undo takes the weight away again (there was none before).
  await andSettle(page, () => undoIn(page, saved).click());
  await expect(card.getByText("1 plate: no weight yet")).toBeVisible();
  await expect(card.getByText("7", { exact: true })).toBeVisible();
  expect(await weights()).toEqual([]);

  await save();
  await openGym(page);
  await expect(card.getByText("1 plate = 10 kg")).toBeVisible();
  await expect(card.getByText("70", { exact: true })).toBeVisible();
});

test("a plate weight save lost after Cancel shows as a toast, and the form opened again saves its own weight [D-047]", async ({ signedInPage: page }) => {
  await pastWorkouts(page, [{ date: addDays(toISODate(), -7), exercise: ROW, loadType: "plates", load: 7 }]);
  const card = progress(page);
  await lostAfterCancel(page, {
    open: async () => {
      await card.getByRole("button", { name: `Edit 1 plate of ${ROW} in kg` }).click();
      const dialog = page.getByRole("dialog", { name: "Plate weight" });
      await expect(dialog).toBeVisible();
      return dialog;
    },
    type: async (dialog, n) => {
      const field = dialog.getByLabel(`1 plate of ${ROW} (kg)`);
      await field.fill(n === 1 ? "12" : "15");
      if (n === 2) await expect(field).toHaveValue("15");
    },
    held: `"kg":12`,
    failed: "Failed to save the plate weight",
  });
  await expect(toast(page, `1 plate of ${ROW} = 15 kg`)).toBeVisible();
  await expect(card.getByText("1 plate = 15 kg")).toBeVisible();
});

// Each value the server refuses keeps Save off and says why at once, in the server's words, on a phone's touch screen;
// a refusal the server answered goes as soon as the value changes. And Undo of a changed weight puts the one before
// back (the Undo sends the old value, not the new one).
test("the plate weight form says why a value is refused, drops a stale refusal, and Undo of a change puts the old weight back, on a phone", async ({
  signedInPage,
  browser,
}) => {
  const userId = await pastWorkouts(signedInPage, [{ date: addDays(toISODate(), -7), exercise: ROW, loadType: "plates", load: 7 }]);
  const weights = async () =>
    (await asOwner((admin) => admin.query("SELECT kg FROM exercise_plate_weights WHERE user_id = $1", [userId]))).rows.map((r) => r.kg);
  await asOwner((admin) =>
    admin.query("INSERT INTO exercise_plate_weights (user_id, exercise_id, kg) SELECT $1, id, 10 FROM exercises WHERE user_id IS NULL AND name = $2", [userId, ROW]),
  );
  // A touch screen of its own at phone width, signed in as the fixture's user.
  const context = await newDevice(browser, signedInPage, { hasTouch: true, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  try {
    await page.goto(new URL("/gym", signedInPage.url()).href);
    const card = progress(page);
    await expect(card.getByText("1 plate = 10 kg")).toBeVisible();
    await card.getByRole("button", { name: `Edit 1 plate of ${ROW} in kg` }).tap();
    const dialog = page.getByRole("dialog", { name: "Plate weight" });
    const field = dialog.getByLabel(`1 plate of ${ROW} (kg)`);
    const save = dialog.getByRole("button", { name: "Save" });
    const moreThanZero = "Must be more than 0", atMost100 = "Must be at most 100";
    const refused = [["0", moreThanZero], ["-1", moreThanZero], ["100.5", atMost100], ["101", atMost100], ["2,555", TWO_DECIMALS], ["abc", "Must be a number"]];
    for (const [value, reason] of refused) {
      await field.fill(value);
      await expect(dialog.getByRole("alert")).toHaveText(reason);
      await expect(save).toBeDisabled();
    }
    for (const value of ["2,5", "2.5", "100"]) {
      await field.fill(value);
      await expect(dialog.getByRole("alert")).toBeHidden();
      await expect(save).toBeEnabled();
    }

    // The server refuses a value the form let through (its request is changed on the way): the next change drops the reason.
    await page.route("**/gym", (route) => {
      const body = route.request().postData() ?? "";
      return route.fallback(route.request().method() === "POST" && body.includes('"kg":50') ? { postData: body.replace('"kg":50', '"kg":100.5') } : {});
    });
    await field.fill("50");
    await andSettle(page, () => save.tap());
    await expect(dialog.getByRole("alert")).toHaveText(atMost100);
    await page.unroute("**/gym");
    await field.fill("40");
    await expect(dialog.getByRole("alert")).toBeHidden();
    await expect(save).toBeEnabled();
    await field.fill("abc");
    await expect(dialog.getByRole("alert")).toHaveText("Must be a number"); // one reason: the field's own
    await field.fill("12,5");
    await expect(dialog.getByRole("alert")).toBeHidden();
    await andSettle(page, () => save.tap());
    await expect(dialog).toBeHidden();
    await expect(card.getByText("1 plate = 12,5 kg")).toBeVisible();
    expect(await weights()).toEqual(["12.50"]);

    await andSettle(page, () => undoIn(page, `1 plate of ${ROW} = 12,5 kg`).tap());
    await expect(card.getByText("1 plate = 10 kg")).toBeVisible();
    expect(await weights()).toEqual(["10.00"]);
  } finally {
    await context.close();
  }
});

// GYMC-06: a bodyweight exercise charts its reps or the kg it adds. GYMC-11: the exercise, the period and that choice
// are kept on the device.
test("a bodyweight exercise charts reps or added weight, and the progress controls are kept after a reload", async ({ signedInPage: page }) => {
  const today = toISODate();
  await pastWorkouts(page, [
    { date: addDays(today, -21), exercise: PULL_UPS, loadType: "bodyweight", load: 0, reps: 12 },
    { date: addDays(today, -14), exercise: PULL_UPS, loadType: "bodyweight", load: 5, reps: 8 },
    { date: addDays(today, -7), exercise: PULL_UPS, loadType: "bodyweight", load: 7.5, reps: 6 },
    { date: addDays(today, -7), exercise: ROW, load: 40 },
  ]);
  const card = progress(page);
  await expect(card.getByRole("tablist", { name: "Bodyweight chart" })).toBeHidden();
  await card.getByRole("combobox", { name: "Exercise" }).selectOption({ label: PULL_UPS });
  const charts = card.getByRole("tablist", { name: "Bodyweight chart" });
  await expect(charts.getByRole("tab", { name: "Reps" })).toHaveAttribute("aria-selected", "true");
  await expect(card.getByRole("img", { name: "Most reps of each workout over the last 90 days" })).toBeVisible();
  await expect(card.getByText("12", { exact: true })).toBeVisible();

  await charts.getByRole("tab", { name: "Added weight" }).click();
  await card.getByRole("tablist", { name: "Chart period" }).getByRole("tab", { name: "30D" }).click();
  const added = card.getByRole("img", { name: "Most added weight (kg) of each workout over the last 30 days" });
  await expect(added).toBeVisible();
  // The value axis in the app's number format (D-037, GYMC-02).
  await expect(card.getByText("7,5", { exact: true })).toBeVisible();
  await expect(card.getByText("12", { exact: true })).toBeHidden();

  await openGym(page);
  await expect(card.getByRole("combobox", { name: "Exercise" }).locator("option:checked")).toHaveText(PULL_UPS);
  await expect(charts.getByRole("tab", { name: "Added weight" })).toHaveAttribute("aria-selected", "true");
  await expect(card.getByRole("tablist", { name: "Chart period" }).getByRole("tab", { name: "30D" })).toHaveAttribute("aria-selected", "true");
  await expect(added).toBeVisible();
});

// D-047: History shows 10 workouts, and More opens all of them in a dialog drawn with the same rows, which open into
// their sets there too. A row open in both lists names its details with an id of its own in each (no duplicate id;
// axe does not look behind the open dialog, so the ids are checked here).
test("History's More opens every workout in a dialog, where a row opens into its sets", async ({ signedInPage: page }) => {
  const today = toISODate();
  // Newest first: 40 kg a week ago, 51 kg twelve weeks ago.
  await pastWorkouts(page, Array.from({ length: 12 }, (_, i) => ({ date: addDays(today, -7 * (i + 1)), exercise: EXERCISE, load: 40 + i })));
  const rows = (list: Locator) => list.getByRole("button", { name: /^Upper \(chest\)/ });
  await expect(history(page).getByText("12 workouts", { exact: true })).toBeVisible();
  await expect(rows(history(page))).toHaveCount(10);

  await history(page).getByRole("button", { name: "More" }).click();
  const all = page.getByRole("dialog", { name: "All workouts" });
  await expect(rows(all)).toHaveCount(12);
  await rows(all).last().click();
  await expect(rows(all).last()).toHaveAttribute("aria-expanded", "true");
  await expect(all.getByText("8 × 51 kg", { exact: true })).toBeVisible();
  // The newest row is in both lists: open, it shows its sets in each.
  await rows(all).first().click();
  await expect(all.getByText("8 × 40 kg", { exact: true })).toBeVisible();
  await expect(history(page).getByText("8 × 40 kg", { exact: true })).toBeAttached();
  // Each toggle names the details of its own list, and no id is on the page twice.
  for (const list of [all, history(page)]) {
    const controls = await rows(list).first().getAttribute("aria-controls");
    await expect(list.locator(`[id="${controls}"]`)).toContainText("8 × 40 kg");
    await expect(page.locator(`[id="${controls}"]`)).toHaveCount(1);
  }
  await expectNoSeriousViolations(page);
});

// GYMA-18, GYMC-07: a deload week is left out whole, also a workout in it not started as a deload; the week after
// compares with the week before the deload.
test("History leaves deload weeks out of the comparison and compares past them", async ({ signedInPage: page }) => {
  const sunday = weekStart(toISODate());
  await pastWorkouts(page, [
    { date: addDays(sunday, -21), exercise: EXERCISE, load: 100 },
    { date: addDays(sunday, -14), exercise: EXERCISE, load: 60, deload: true },
    { date: addDays(sunday, -12), exercise: EXERCISE, load: 70 },
    { date: addDays(sunday, -7), exercise: EXERCISE, load: 110 },
  ]);
  await expect(history(page).getByText("4 workouts", { exact: true })).toBeVisible();
  await expect(history(page).getByText("Weight +10 kg vs the week before")).toHaveCount(1);
  await expect(history(page).getByText("Deload week, left out of progress")).toHaveCount(2);
  await expect(history(page).getByText("Nothing to compare with yet")).toHaveCount(1);
  await expect(progress(page).getByRole("img", { name: /^Heaviest load \(kg\)/ })).toBeVisible();
  await expect(progress(page).getByText("110", { exact: true })).toBeVisible();
  await expect(progress(page).getByText("100", { exact: true })).toBeVisible();
  await expect(progress(page).getByText("60", { exact: true })).toBeHidden();
});

// The deload dialog lists its weeks from the server's day: a browser whose clock is a week ahead or behind still marks
// the server's week as this week.
for (const days of [7, -7]) {
  test(`the deload dialog lists its weeks from the server's day, with the browser ${days} days off`, async ({ signedInPage: page }) => {
    await page.clock.install({ time: new Date(Date.now() + days * 86_400_000) });
    await openGym(page);
    await page.getByRole("button", { name: "Edit deload weeks" }).click();
    const last = page.getByRole("dialog", { name: "Deload weeks" }).getByLabel("Last deload");
    const sunday = weekStart(toISODate());
    await expect(last.getByRole("option", { name: /\(this week\)$/ })).toHaveText(`${formatDMY(sunday)} - ${formatDMY(addDays(sunday, 6))} (this week)`);
  });
}

// Item 2 (D-043): the banner's Resume locks its own spot, so a double tap resumes once and the second tap lands nowhere.
test("a double tap on the banner's Resume resumes once", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await andSettle(page, () => page.getByRole("button", { name: "Exit, finish later" }).click());
  // A new page, so Exit's own tap burst (its spot may hold the banner's Resume now) is over.
  await openGym(page);
  const resume = banner(page).getByRole("button", { name: "Resume" });
  await expect(resume).toBeVisible();
  expect(await guardedBurst(page, resume)).toEqual({ writes: 1, clicks: 1 });
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeVisible();
});

// A write refused because the workout ended elsewhere (finished: WORKOUT_FINISHED; cancelled: WORKOUT_GONE) takes the
// workout off the screen at once, with one toast, and sends no other write after it; the refresh that follows shows no
// second toast. The other device's clock stands still, so the workout leaves before any refresh; the clock then runs
// again for the refresh. Notes typed and not saved yet go with the tap's blur, so Exit and Finish then send nothing of
// their own. A set's Delete in a cancelled workout finds no set (SET_GONE, which says nothing of the workout), so that
// workout leaves on the refresh that follows the answer, with the same one toast.
const ENDINGS = ["finished", "cancelled"] as const;
const typedThen = (button: string) => async (other: Page) => {
  await notes(other).fill("Typed here");
  await andSettle(other, () => other.getByRole("button", { name: button }).click(), "Typed here");
};
const STALE_WRITES: {
  write: string;
  act: (other: Page) => Promise<void>;
  onRefresh?: (typeof ENDINGS)[number];
}[] = [
  {
    write: "Cancel",
    act: async (other) => {
      await other.getByRole("button", { name: "Cancel workout" }).click();
      await andSettle(other, () => other.getByRole("button", { name: "Delete", exact: true }).click());
    },
  },
  { write: "Finish", act: (other) => andSettle(other, () => other.getByRole("button", { name: "Finish workout" }).click()) },
  { write: "a logged set", act: logSet },
  {
    write: "a set's Delete",
    act: async (other) => {
      await other.getByRole("button", { name: `Show ${EXERCISE}`, exact: true }).click();
      await andSettle(other, () => other.getByRole("button", { name: `Delete set 1 of ${EXERCISE}` }).click());
    },
    onRefresh: "cancelled",
  },
  {
    write: "Pause",
    act: async (other) => {
      // Ends Resume's tap burst (D-043): Pause may sit where the banner's Resume was.
      await other.keyboard.press("Shift");
      await andSettle(other, () => other.getByRole("button", { name: "Pause", exact: true }).click());
    },
  },
  {
    write: "a notes save",
    act: async (other) => {
      await notes(other).fill("Typed here");
      await andSettle(other, () => notes(other).blur(), "Typed here");
    },
  },
  { write: "Exit", act: (other) => andSettle(other, () => other.getByRole("button", { name: "Exit, finish later" }).click()) },
  { write: "notes typed, then Exit,", act: typedThen("Exit, finish later") },
  { write: "notes typed, then Finish,", act: typedThen("Finish workout") },
];
for (const { write, act, onRefresh } of STALE_WRITES) {
  for (const ended of ENDINGS) {
    const when = onRefresh === ended ? "on the refresh that follows" : "at once";
    test(`${write} of a workout ${ended} on another device takes it off the screen ${when}, with one toast [D-039]`, async ({ signedInPage: page, browser }) => {
      await openGym(page);
      await startWorkout(page, DAY);
      await logSet(page);
      const other = await otherDevice(browser, page);
      await andSettle(other, () => banner(other).getByRole("button", { name: "Resume" }).click());
      await expect(other.getByRole("timer", { name: "Workout time" })).toBeVisible();
      if (ended === "finished") {
        await andSettle(page, () => page.getByRole("button", { name: "Finish workout" }).click());
      } else {
        await page.getByRole("button", { name: "Cancel workout" }).click();
        await andSettle(page, () => page.getByRole("button", { name: "Delete", exact: true }).click());
      }
      const userId = await signedInUserId(page);
      const sets = await setCount(userId);
      const writes = countWrites(other);

      await act(other);
      if (onRefresh === ended) {
        await settled(other);
        await expect(other.getByRole("timer", { name: "Workout time" })).toBeVisible();
        await expect(toast(other, WORKOUT_ENDED_ELSEWHERE)).toHaveCount(0);
      } else {
        await expect(other.getByRole("timer", { name: "Workout time" })).toBeHidden();
        await expect(toast(other, WORKOUT_ENDED_ELSEWHERE)).toHaveCount(1);
      }
      const refreshed = other.waitForResponse((r) => isRefresh(other, r.request()));
      await other.clock.resume();
      await refreshed;
      await other.evaluate(headIsQuiet);
      expect(writes).toHaveLength(1);
      await expect(toast(other, WORKOUT_ENDED_ELSEWHERE)).toHaveCount(1);
      await expect(toast(other, WORKOUT_FINISHED)).toHaveCount(0);
      await expect(toast(other, WORKOUT_GONE)).toHaveCount(0);
      await expect(other.getByRole("timer", { name: "Workout time" })).toBeHidden();
      expect(await setCount(userId)).toBe(sets);
      await other.context().close();
    });
  }
}

// The tab bar shows only below 1024 px, so on a wider window Delete keeps no room for it. At the page's end the question,
// taller than "Cancel workout", pushes Delete past the window's bottom edge: opening it scrolls just enough to show Delete,
// not the phone's extra room for the bar (which would put it about 6rem higher).
test("on a desktop, Delete of the Cancel question at the page's end scrolls only into view", async ({ signedInPage: page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openGym(page);
  await startWorkout(page, DAY);
  await dismissToast(page, `Started "${DAY}"`);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole("button", { name: "Cancel workout" }).click();
  const del = page.getByRole("button", { name: "Delete", exact: true });
  await expect(del).toBeInViewport();
  const box = (await del.boundingBox())!;
  expect(box.y + box.height).toBeGreaterThan(800 - 2);
  expect(box.y + box.height).toBeLessThanOrEqual(800 + 1);
});

// On a phone the question that replaces "Cancel workout" is taller than that button, so its Delete would land under the
// tab bar: opening it scrolls it above the bar, and a tap at Delete's place on the screen deletes the workout.
test("on a phone, Delete of the Cancel question shows above the tab bar and a tap there deletes the workout", async ({ signedInPage: page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openGym(page);
  await startWorkout(page, DAY);
  await logSet(page);
  const toasts = page.locator(".toast-item");
  while (await toasts.count()) await toasts.first().getByRole("button", { name: "Dismiss notification" }).click();
  await expect(toasts).toHaveCount(0);
  // What a tap at a point of the screen lands on.
  const hit = (at: { x: number; y: number }) => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("button, a")?.textContent, at);

  // "Cancel workout" just above the tab bar, where a thumb finds it at the end of the workout.
  const cancel = page.getByRole("button", { name: "Cancel workout" });
  await cancel.scrollIntoViewIfNeeded();
  const barTop = (await page.getByRole("navigation", { name: "Mobile Navigation" }).boundingBox())!.y;
  const before = (await cancel.boundingBox())!;
  await page.evaluate((dy) => window.scrollBy(0, dy), before.y + before.height - (barTop - 8));
  const at = center(await cancel.boundingBox());
  expect(await hit(at)).toBe("Cancel workout");
  await page.mouse.click(at.x, at.y);

  const del = page.getByRole("button", { name: "Delete", exact: true });
  await expect(del).toBeVisible();
  const spot = center(await del.boundingBox());
  expect(await hit(spot)).toBe("Delete");
  await andSettle(page, () => page.mouse.click(spot.x, spot.y));
  await expect(page).toHaveURL(/\/gym$/);
  await expect(toast(page, "Cancelled the workout")).toBeVisible();
  await expect(page.getByRole("timer", { name: "Workout time" })).toBeHidden();
  expect(await setCount(await signedInUserId(page))).toBe(0);
});
