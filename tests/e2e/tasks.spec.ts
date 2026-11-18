import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { andSettle, expectNoSeriousViolations, test } from "./helpers";

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

// Tests tagged @a11y run on every project (desktop and phone width); the rest run on desktop only, because only the
// axe scan depends on the width (see playwright.config.ts).
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
  await expect(page.getByText("No daily tasks yet.")).toBeVisible();
  await expect(row).toBeHidden();
  await tab("Personal").click();
  await expect(row).toBeVisible();

  // The same after a reload, so the database holds the task in its own space.
  await openTasks(page, "Daily");
  await expect(row).toBeVisible();
  await tab("Business").click();
  await expect(page.getByText("No daily tasks yet.")).toBeVisible();
  await tab("Today").click();
  await expect(page.getByText("Nothing planned for today.")).toBeVisible();
});
