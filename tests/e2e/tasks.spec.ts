import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { andSettle, burst, center, expectNoSeriousViolations, test } from "./helpers";

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

test("a signed-in user adds, completes, edits and deletes a task, with Undo for each, also after a reload", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");

  const title = taskTitle();
  const renamed = `${title} renamed`;
  const row = (name: string) => page.getByText(name, { exact: true });
  const progress = page.getByRole("region", { name: "Progress" });
  const dismissToast = async (message: string) => {
    await page.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(page.getByText(message)).toBeHidden();
  };

  // Add: the row, the toast and the Progress card.
  await expect(page.getByText("Nothing planned for today.")).toBeVisible();
  await addTask(page, title, "New task");
  await expect(page.getByText(`Added "${title}"`)).toBeVisible();
  await expect(progress.getByText("0 of 1 done")).toBeVisible();
  await dismissToast(`Added "${title}"`);

  // Complete, then Undo the completion. Each answer is told apart by the box's new state: the page also reloads its
  // list after every change, and that earlier reload could otherwise be taken for the answer.
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
  const name = `e2e-${randomUUID().slice(0, 8)}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
  try {
    await page.goto("/todos", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/signin\?next=%2Ftodos$/);
    await page.getByLabel("Username").fill(name);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/todos$/);
    await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
  } finally {
    try {
      await admin.query("DELETE FROM users WHERE issuer = 'dev' AND subject = $1", [name]);
    } finally {
      await admin.end();
    }
  }
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

// The page reads its list again after each write (a second action with no body of its own), so a burst's writes are
// counted by a piece of their body.
async function writesIn(page: Page, spot: { x: number; y: number }, body: string) {
  let writes = 0;
  const count = (r: { method(): string; postData(): string | null }) => {
    if (r.method() === "POST" && (r.postData() ?? "").includes(body)) writes++;
  };
  page.on("request", count);
  await burst(page, spot);
  page.off("request", count);
  return writes;
}

test("a double tap on Save or on a task's box writes once [D-043]", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");
  const title = taskTitle();
  await page.getByRole("button", { name: "Add task" }).click();
  const form = page.getByRole("dialog", { name: "New task" });
  await form.getByLabel("Title").fill(title);
  expect(await writesIn(page, center(await form.getByRole("button", { name: "Save" }).boundingBox()), `"title":"${title}"`)).toBe(1);
  await expect(page.getByText(title, { exact: true })).toHaveCount(1);
  await page.keyboard.press("Shift");
  const box = page.getByRole("button", { name: `Mark ${title} as complete` });
  expect(await writesIn(page, center(await box.boundingBox()), `"isCompleted"`)).toBe(1);
  await expect(page.getByRole("button", { name: `Mark ${title} as incomplete` })).toBeVisible();
  await expect(page.getByRole("region", { name: "Progress" }).getByText("1 of 1 done")).toBeVisible();
});

test("a Save in a form opened again while the last opening's save is unanswered still saves [D-043]", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");
  const [first, second] = [taskTitle(), taskTitle()];
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/todos", async (route) => {
    if (route.request().method() === "POST" && (route.request().postData() ?? "").includes(`"title":"${first}"`)) await held;
    await route.fallback();
  });
  await page.getByRole("button", { name: "Add task" }).click();
  const form = page.getByRole("dialog", { name: "New task" });
  await form.getByLabel("Title").fill(first);
  const firstAnswered = page.waitForResponse((r) => (r.request().postData() ?? "").includes(`"title":"${first}"`));
  await form.getByRole("button", { name: "Save" }).click();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();
  // The first opening's Save must not lock this opening's Save (Next sends it once the first one has answered).
  await page.getByRole("button", { name: "Add task" }).click();
  await form.getByLabel("Title").fill(second);
  await form.getByRole("button", { name: "Save" }).click();
  release();
  await firstAnswered;
  await expect(form).toBeHidden();
  await expect(page.getByText(first, { exact: true })).toBeVisible();
  await expect(page.getByText(second, { exact: true })).toBeVisible();
});

test("an Undo of a tick that fails says so and keeps a Retry, which puts the box back [D-040]", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");
  const title = taskTitle();
  await addTask(page, title, "New task");
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await andSettle(page, () => page.getByRole("button", { name: `Mark ${title} as complete` }).click(), `"isCompleted":true`);
  // The Undo's write gets a server error; the list's reload still goes through.
  await page.route("**/todos", (route) =>
    route.request().method() === "POST" && (route.request().postData() ?? "").includes(`"isCompleted":false`)
      ? route.fulfill({ status: 500, contentType: "text/plain", body: "boom" })
      : route.fallback(),
  );
  await page.getByRole("button", { name: "Undo" }).click();
  const warning = page.locator(".toast-item").filter({ hasText: "Failed to undo" });
  await expect(warning.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("button", { name: `Mark ${title} as incomplete` })).toBeVisible();
  await page.unroute("**/todos");
  await andSettle(page, () => warning.getByRole("button", { name: "Retry" }).click(), `"isCompleted":false`);
  await expect(page.getByRole("button", { name: `Mark ${title} as complete` })).toBeVisible();
});

test("an add whose answer was lost, saved again, adds once and says it was already added [D-040]", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");
  const title = taskTitle();
  let lost = false;
  // The first add reaches the server, but its answer never comes back.
  await page.route("**/todos", async (route) => {
    const r = route.request();
    if (!lost && r.method() === "POST" && "next-action" in r.headers() && (r.postData() ?? "").includes(`"title":"${title}"`)) {
      lost = true;
      await route.fetch();
      return route.abort();
    }
    await route.fallback();
  });
  await page.getByRole("button", { name: "Add task" }).click();
  const form = page.getByRole("dialog", { name: "New task" });
  await form.getByLabel("Title").fill(title);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("Failed to save task")).toBeVisible();
  await page.keyboard.press("Shift");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"title":"${title}"`);
  const toast = page.locator(".toast-item").filter({ hasText: `Already added "${title}"` });
  await expect(toast).toBeVisible();
  await expect(toast.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await openTasks(page, "Today");
  await expect(page.getByText(title, { exact: true })).toHaveCount(1);
});

test("a newer change takes the Undo off the older toasts about the same task, and only those [D-040]", async ({ signedInPage: page }) => {
  await openTasks(page, "Today");
  const [a, b] = [taskTitle(), taskTitle()];
  await addTask(page, a, "New task");
  await addTask(page, b, "New task");
  const toast = (text: string) => page.locator(".toast-item").filter({ hasText: text });
  // b's add toast stays; a is edited, then deleted.
  await page.getByRole("button", { name: `Edit ${a}` }).click();
  const form = page.getByRole("dialog", { name: "Edit task" });
  await form.getByLabel("Title").fill(`${a} v2`);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"title":"${a} v2"`);
  await expect(toast(`Saved "${a} v2"`).getByRole("button", { name: "Undo" })).toBeVisible();
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: `Delete ${a} v2` }).click());
  await expect(toast(`Removed "${a} v2"`).getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(toast(`Saved "${a} v2"`).getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect(toast(`Added "${a}"`).getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect(toast(`Added "${b}"`).getByRole("button", { name: "Undo" })).toBeVisible();
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
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/todos", async (route) => {
    if (route.request().method() === "POST" && (route.request().postData() ?? "").includes(`"title":"${title}"`)) await held;
    await route.fallback();
  });
  await page.getByRole("button", { name: "Add task" }).click();
  const form = page.getByRole("dialog", { name: "New task" });
  await form.getByLabel("Title").fill(title);
  const answered = page.waitForResponse((r) => (r.request().postData() ?? "").includes(`"title":"${title}"`));
  await form.getByRole("button", { name: "Save" }).click();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();
  release();
  await answered;
  await expect(page.locator(".toast-item").filter({ hasText: "Too long (max 150)" })).toBeVisible();
  await expect(form).toBeHidden();
  const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
  try {
    expect((await admin.query("SELECT 1 FROM todos WHERE title = $1", [title])).rowCount).toBe(0);
  } finally {
    await admin.end();
  }
});
