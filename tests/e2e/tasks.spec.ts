import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import {
  andSettle,
  asOwner,
  burst,
  center,
  countWrites,
  dismissToast,
  expectNoSeriousViolations,
  expectToastWithoutUndo,
  holdWrites,
  loseAnswerOnce,
  pauseClock,
  recordStates,
  refreshesDone,
  signInThroughForm,
  test,
  toast,
  undoIn,
} from "./helpers";

// The page opens on the Daily tab of the Personal space, so a reload (which also starts on Daily) goes through here too.
async function openTasks(page: Page, tab: "Daily" | "Today") {
  await page.goto("/todos");
  await expect(page).toHaveURL(/\/todos$/);
  await page.getByRole("tab", { name: tab, exact: true }).click();
  await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
}

const taskTitle = () => `E2E task ${randomUUID().slice(0, 8)}`;

// Adds a task on the tab that is open; the dialog is "New task" on Today and "New daily task" on Daily.
async function addTask(page: Page, title: string, dialogName: "New task" | "New daily task") {
  await page.getByRole("button", { name: "Add task" }).click();
  const form = page.getByRole("dialog", { name: dialogName });
  await form.getByLabel("Title").fill(title);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"title":"${title}"`);
  await expect(form).toBeHidden();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

// Tests tagged @a11y run on every project (desktop and phone width, dark and light); the rest run on desktop only, because only the
// axe scan depends on the width and the color scheme (see playwright.config.ts).
test("the Tasks page has no serious violations, also with the New task form open", { tag: "@a11y" }, async ({ signedInPage: page }) => {
  await openTasks(page, "Today");
  await addTask(page, taskTitle(), "New task");
  await expectNoSeriousViolations(page);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("dialog", { name: "New task" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

// A dialog takes every Tab step itself: Safari's own Tab passes over buttons and leaves the dialog.
test("Tab in a dialog steps through its fields and buttons, selects a field's text and stays inside", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");
  await page.getByRole("button", { name: "Add task" }).click();
  const form = page.getByRole("dialog", { name: "New task" });
  const close = form.getByRole("button", { name: "Close modal" });
  const field = form.getByLabel("Title");
  const cancel = form.getByRole("button", { name: "Cancel" });
  const save = form.getByRole("button", { name: "Save" });
  await expect(close).toBeVisible();
  await page.evaluate(() => addEventListener("keydown", (e) => (document.body.dataset.tabTaken = String(e.defaultPrevented))));
  const step = async (key: "Tab" | "Shift+Tab", to: Locator) => {
    await page.keyboard.press(key);
    await expect(page.locator("body")).toHaveAttribute("data-tab-taken", "true");
    await expect(to).toBeFocused();
  };

  // Save is off until there is a title, so the steps pass over it and wrap at both ends.
  await step("Tab", close);
  await step("Tab", field);
  await step("Tab", cancel);
  await step("Tab", close);
  await step("Shift+Tab", cancel);
  await step("Shift+Tab", field);

  await field.fill("Water the plants");
  await step("Tab", cancel);
  await step("Shift+Tab", field);
  expect(await field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, "Water the plants".length]);
  await step("Tab", cancel);
  await step("Tab", save);
  await step("Tab", close);
});

test("a signed-in user adds, completes, edits and deletes a task, with Undo for each, also after a reload", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");

  const title = taskTitle();
  const renamed = `${title} renamed`;
  const row = (name: string) => page.getByText(name, { exact: true });
  const progress = page.getByRole("region", { name: "Progress" });

  // Add: the row, the toast and the Progress card.
  await expect(page.getByText("Nothing planned for today.")).toBeVisible();
  await addTask(page, title, "New task");
  await expect(page.getByText(`Added "${title}"`)).toBeVisible();
  await expect(progress.getByText("0 of 1 done")).toBeVisible();
  await dismissToast(page, `Added "${title}"`);

  // Complete, then Undo the completion; each wait names its write by the box's new state.
  const ticked = `"isCompleted":true`;
  const unticked = `"isCompleted":false`;
  await andSettle(page, () => page.getByRole("button", { name: `Mark ${title} as complete` }).click(), ticked);
  await expect(page.getByText(`Completed "${title}"`)).toBeVisible();
  await expect(progress.getByText("1 of 1 done")).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click(), unticked);
  await expect(page.getByRole("button", { name: `Mark ${title} as complete` })).toBeVisible();
  await expect(progress.getByText("0 of 1 done")).toBeVisible();

  // Complete again: it is still done after a reload, so the database has it.
  await andSettle(page, () => page.getByRole("button", { name: `Mark ${title} as complete` }).click(), ticked);
  await expect(progress.getByText("1 of 1 done")).toBeVisible();
  await openTasks(page, "Today");
  await expect(page.getByRole("button", { name: `Mark ${title} as incomplete` })).toBeVisible();

  // Edit the title; Undo puts the old one back, also after a reload.
  await page.getByRole("button", { name: `Edit ${title}` }).click();
  const form = page.getByRole("dialog", { name: "Edit task" });
  await form.getByLabel("Title").fill(renamed);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"title":"${renamed}"`);
  await expect(form).toBeHidden();
  await expect(page.getByText(`Saved "${renamed}"`)).toBeVisible();
  await expect(row(renamed)).toBeVisible();
  await expect(row(title)).toBeHidden();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click(), `"title":"${title}"`);
  await expect(row(title)).toBeVisible();
  await expect(row(renamed)).toBeHidden();
  await openTasks(page, "Today");
  await expect(row(title)).toBeVisible();
  await expect(row(renamed)).toBeHidden();

  // Delete, then Undo the delete: the same task comes back, also after a reload.
  await andSettle(page, () => page.getByRole("button", { name: `Delete ${title}` }).click());
  await expect(row(title)).toBeHidden();
  await expect(page.getByText(`Removed "${title}"`)).toBeVisible();
  await expect(progress.getByText("No tasks for today.")).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click(), `"title":"${title}"`);
  await expect(row(title)).toBeVisible();
  await openTasks(page, "Today");
  await expect(row(title)).toBeVisible();
  await expect(progress.getByText("1 of 1 done")).toBeVisible();
});

test("a daily task shows only on the Daily tab of its own space", async ({ signedInPage: page }) => {
  await openTasks(page, "Daily");

  const title = taskTitle();
  const row = page.getByText(title, { exact: true });
  const tab = (name: string) => page.getByRole("tab", { name, exact: true });

  await addTask(page, title, "New daily task");

  // Not on the Today list of the same space.
  await tab("Today").click();
  await expect(page.getByText("Nothing planned for today.")).toBeVisible();
  await expect(row).toBeHidden();

  // Not on the Daily list of the other space.
  await tab("Daily").click();
  await expect(row).toBeVisible();
  await tab("Business").click();
  await expect(page.getByRole("region", { name: "Daily tasks" }).getByText("No daily tasks yet.")).toBeVisible();
  await expect(row).toBeHidden();
  await tab("Personal").click();
  await expect(row).toBeVisible();

  // The same after a reload, so the database holds the task in its own space.
  await openTasks(page, "Daily");
  await expect(row).toBeVisible();
  await tab("Business").click();
  await expect(page.getByRole("region", { name: "Daily tasks" }).getByText("No daily tasks yet.")).toBeVisible();
  await tab("Today").click();
  await expect(page.getByText("Nothing planned for today.")).toBeVisible();
});

test("a signed-out visit to /todos goes to the sign-in form, which comes back to /todos [PATH]", async ({ page }) => {
  await signInThroughForm(page, "/todos", (page) => expect(page.getByRole("button", { name: "Add task" })).toBeVisible());
});

test("the Progress card counts the list on screen and names its tab [TASK-10]", async ({ signedInPage: page }) => {
  await openTasks(page, "Daily");
  const progress = page.getByRole("region", { name: "Progress" });
  await expect(progress.getByText("No daily tasks yet.")).toBeVisible();
  await addTask(page, taskTitle(), "New daily task");
  await expect(progress.getByText("0 of 1 done")).toBeVisible();
  await expect(progress.getByText("Daily", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await expect(progress.getByText("No tasks for today.")).toBeVisible();
  await addTask(page, taskTitle(), "New task");
  await addTask(page, taskTitle(), "New task");
  await expect(progress.getByText("0 of 2 done")).toBeVisible();
  await expect(progress.getByText("Today", { exact: true })).toBeVisible();
});

test("a double tap on Save or on a task's box writes once [D-043]", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");
  const title = taskTitle();
  await page.getByRole("button", { name: "Add task" }).click();
  const form = page.getByRole("dialog", { name: "New task" });
  await form.getByLabel("Title").fill(title);
  expect(await burst(page, center(await form.getByRole("button", { name: "Save" }).boundingBox()))).toBe(1);
  await expect(page.getByText(title, { exact: true })).toHaveCount(1);
  await page.keyboard.press("Shift");
  const box = page.getByRole("button", { name: `Mark ${title} as complete` });
  expect(await burst(page, center(await box.boundingBox()))).toBe(1);
  await expect(page.getByRole("button", { name: `Mark ${title} as incomplete` })).toBeVisible();
  await expect(page.getByRole("region", { name: "Progress" }).getByText("1 of 1 done")).toBeVisible();
});

test("a tick sends one write: the list is not read again after it [D-047]", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");
  const title = taskTitle();
  await addTask(page, title, "New task");
  await refreshesDone(page);
  const writes = countWrites(page);
  await andSettle(page, () => page.getByRole("button", { name: `Mark ${title} as complete` }).click());
  await expect(page.getByRole("button", { name: `Mark ${title} as incomplete` })).toBeVisible();
  // The refresh after the answer (D-034) has come and gone, so a read the tick set off has been sent by then.
  await refreshesDone(page);
  expect(writes.map((r) => r.postData())).toEqual([expect.stringContaining(`"isCompleted":true`)]);
});

// The row is merged, not replaced by the values the form opened with: another tab's tick, shown here while the form was
// open, stays on screen through the save, never flashing back before the refresh brings it.
test("an edit saved here keeps another tab's change to the same task on screen [D-047]", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");
  const title = taskTitle();
  const renamed = `${title} renamed`;
  await addTask(page, title, "New task");
  await page.getByRole("button", { name: `Edit ${title}` }).click();
  const form = page.getByRole("dialog", { name: "Edit task" });
  await expect(form).toBeVisible();
  const other = await page.context().newPage();
  try {
    await openTasks(other, "Today");
    await andSettle(other, () => other.getByRole("button", { name: `Mark ${title} as complete` }).click());
  } finally {
    await other.close();
  }
  // This tab's refresh shows the tick behind the open form.
  await expect(page.getByRole("button", { name: `Mark ${title} as incomplete` })).toBeVisible();
  await refreshesDone(page);
  const box = await recordStates(
    page,
    (name: string) => document.querySelector(`button[aria-label="Mark ${name} as complete"]`) ? "open"
      : document.querySelector(`button[aria-label="Mark ${name} as incomplete"]`) ? "done" : undefined,
    renamed,
  );
  await form.getByLabel("Title").fill(renamed);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"title":"${renamed}"`);
  await expect(page.getByRole("button", { name: `Mark ${renamed} as incomplete` })).toBeVisible();
  await refreshesDone(page);
  expect(await box()).toEqual(["done"]);
});

test("a Save in a form opened again while the last opening's save is unanswered still saves [D-043]", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");
  const [first, second] = [taskTitle(), taskTitle()];
  const release = await holdWrites(page, `"title":"${first}"`);
  await page.getByRole("button", { name: "Add task" }).click();
  const form = page.getByRole("dialog", { name: "New task" });
  await form.getByLabel("Title").fill(first);
  await form.getByRole("button", { name: "Save" }).click();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();
  // The first opening's Save must not lock this opening's Save (Next sends it once the first one has answered).
  await page.getByRole("button", { name: "Add task" }).click();
  await form.getByLabel("Title").fill(second);
  await form.getByRole("button", { name: "Save" }).click();
  await andSettle(page, async () => release(), `"title":"${first}"`);
  await expect(form).toBeHidden();
  await expect(page.getByText(first, { exact: true })).toBeVisible();
  await expect(page.getByText(second, { exact: true })).toBeVisible();
});

// FormModal owns each opening (D-047): a form opened again gets its own add id, and the answer of the first opening's
// save, coming while the second is on screen, neither closes it nor clears what is typed in it.
test("a form opened again gets its own id, and the first opening's late answer leaves it as it is [D-047]", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");
  const [first, second] = [taskTitle(), taskTitle()];
  const writes = countWrites(page, `"title":"E2E task `);
  const release = await holdWrites(page, `"title":"${first}"`);
  await page.getByRole("button", { name: "Add task" }).click();
  const form = page.getByRole("dialog", { name: "New task" });
  await form.getByLabel("Title").fill(first);
  await form.getByRole("button", { name: "Save" }).click();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();

  await page.getByRole("button", { name: "Add task" }).click();
  await form.getByLabel("Title").fill(second);
  await andSettle(page, async () => release(), `"title":"${first}"`);
  await expect(page.getByText(`Added "${first}"`, { exact: true })).toBeVisible();
  await expect(form).toBeVisible();
  await expect(form.getByLabel("Title")).toHaveValue(second);
  await expect(form.getByRole("button", { name: "Save" })).toBeEnabled();
  await expect(form.getByRole("alert")).toHaveCount(0);

  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"title":"${second}"`);
  await expect(form).toBeHidden();
  await expect(page.getByText(`Added "${second}"`, { exact: true })).toBeVisible();
  await expect(page.getByText(/^Already added/)).toHaveCount(0);
  const ids = writes.map((r) => /"id":"([0-9a-f-]{36})"/.exec(r.postData() ?? "")?.[1]);
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
  await openTasks(page, "Today");
  await expect(page.getByText(first, { exact: true })).toBeVisible();
  await expect(page.getByText(second, { exact: true })).toBeVisible();
});

test("an Undo of a tick that fails says so and keeps a Retry, which puts the box back [D-040]", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");
  const title = taskTitle();
  await addTask(page, title, "New task");
  await dismissToast(page);
  await andSettle(page, () => page.getByRole("button", { name: `Mark ${title} as complete` }).click(), `"isCompleted":true`);
  // Only the Undo's write gets a server error; the box stays ticked until its Retry succeeds.
  await page.route("**/todos", (route) =>
    route.request().method() === "POST" && (route.request().postData() ?? "").includes(`"isCompleted":false`)
      ? route.fulfill({ status: 500, contentType: "text/plain", body: "boom" })
      : route.fallback(),
  );
  await page.getByRole("button", { name: "Undo" }).click();
  const warning = toast(page, "Failed to undo");
  await expect(warning.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("button", { name: `Mark ${title} as incomplete` })).toBeVisible();
  await page.unroute("**/todos");
  await andSettle(page, () => warning.getByRole("button", { name: "Retry" }).click(), `"isCompleted":false`);
  await expect(page.getByRole("button", { name: `Mark ${title} as complete` })).toBeVisible();
});

// The page's clock stands still from Save again on, so its toast does not run out.
test("an add whose answer was lost, saved again, adds once and says it was already added [D-040]", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openTasks(page, "Today");
  const title = taskTitle();
  // The first add reaches the server, but its answer never comes back.
  await loseAnswerOnce(page, `"title":"${title}"`);
  await page.getByRole("button", { name: "Add task" }).click();
  const form = page.getByRole("dialog", { name: "New task" });
  await form.getByLabel("Title").fill(title);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("Failed to save task")).toBeVisible();
  await page.keyboard.press("Shift");
  await pauseClock(page);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"title":"${title}"`);
  await expectToastWithoutUndo(page, `Already added "${title}"`);
  await page.clock.resume();
  await openTasks(page, "Today");
  await expect(page.getByText(title, { exact: true })).toHaveCount(1);
});

// The page's clock stands still from the first add on, so no toast runs out.
test("a newer change takes the Undo off the older toasts about the same task, and only those [D-040]", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openTasks(page, "Today");
  await pauseClock(page);
  const [a, b] = [taskTitle(), taskTitle()];
  await addTask(page, a, "New task");
  await addTask(page, b, "New task");
  // b's add toast stays; a is edited, then deleted.
  await page.getByRole("button", { name: `Edit ${a}` }).click();
  const form = page.getByRole("dialog", { name: "Edit task" });
  await form.getByLabel("Title").fill(`${a} v2`);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"title":"${a} v2"`);
  await expect(undoIn(page, `Saved "${a} v2"`)).toBeVisible();
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: `Delete ${a} v2` }).click());
  await expect(undoIn(page, `Removed "${a} v2"`)).toBeVisible();
  await expectToastWithoutUndo(page, `Saved "${a} v2"`);
  await expectToastWithoutUndo(page, `Added "${a}"`);
  await expect(undoIn(page, `Added "${b}"`)).toBeVisible();
});

test("a task deleted in one tab leaves another tab after its refresh, and closes its open edit form [SERVER-STATE, TASK-03]", async ({
  signedInPage: page,
}) => {
  await openTasks(page, "Today");
  const title = taskTitle();
  await addTask(page, title, "New task");
  const other = await page.context().newPage();
  try {
    await openTasks(other, "Today");
    await other.getByRole("button", { name: `Edit ${title}` }).click();
    const form = other.getByRole("dialog", { name: "Edit task" });
    await expect(form).toBeVisible();
    // A mark on the window: a reload would drop it.
    await other.evaluate(() => Object.assign(window, { kept: true }));
    await page.bringToFront();
    await andSettle(page, () => page.getByRole("button", { name: `Delete ${title}` }).click());
    await expect(form).toBeHidden();
    await expect(other.getByText("This item was deleted.")).toBeVisible();
    await expect(other.getByText(title, { exact: true })).toBeHidden();
    expect(await other.evaluate(() => (window as Window & { kept?: boolean }).kept)).toBe(true);
  } finally {
    await other.close();
  }
});

test("a refusal that answers after the form was closed with Cancel shows the server's words in a toast, and nothing is saved [D-040]", async ({
  signedInPage: page,
}) => {
  await openTasks(page, "Today");
  const title = `${taskTitle()} ${"x".repeat(150)}`;
  const release = await holdWrites(page, `"title":"${title}"`);
  await page.getByRole("button", { name: "Add task" }).click();
  const form = page.getByRole("dialog", { name: "New task" });
  await form.getByLabel("Title").fill(title);
  await form.getByRole("button", { name: "Save" }).click();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();
  await andSettle(page, async () => release(), `"title":"${title}"`);
  await expect(toast(page, "Too long (max 150)")).toBeVisible();
  await expect(form).toBeHidden();
  expect((await asOwner((db) => db.query("SELECT 1 FROM todos WHERE title = $1", [title]))).rowCount).toBe(0);
});
