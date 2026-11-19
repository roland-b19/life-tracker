import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import { andSettle, expectNoSeriousViolations, test } from "./helpers";

// The shared categories card (app/components/categories-card.tsx) on the three pages that use it, D-016. One driver runs
// the whole flow, so the pages cannot drift apart: only how a page opens and how an item is added differ.
interface Surface {
  /** Goes to the page (also the reload) and waits until it is ready. */
  open: (page: Page) => Promise<void>;
  /** Adds an item filed under `category` and clears the toast it shows. */
  addItem: (page: Page, name: string, category: string) => Promise<void>;
  /** The item's row on the page. */
  item: (page: Page, name: string) => Locator;
}

const hex = () => randomUUID().slice(0, 8);
// Categories are stored lower case; the item form and the group headings show them with a capital.
const label = (category: string) => category.charAt(0).toUpperCase() + category.slice(1);

// The region's name is its heading: "Categories", the count and the fold button ("Categories 1 Show categories"). The
// Units card on the Shopping tab starts with "Units", so the start of the name tells the two apart.
const card = (page: Page) => page.getByRole("region", { name: /^Categories\b/ });
const dismissButton = (page: Page) => page.getByRole("button", { name: "Dismiss notification" });

// Only one toast is open at a time, so there is one Undo and one Dismiss button.
async function dismissToast(page: Page) {
  await dismissButton(page).click();
  await expect(dismissButton(page)).toHaveCount(0);
}

// Saves the open item form and waits for the action's answer; `piece` names the item in the request body.
async function saveItem(page: Page, form: Locator, piece: string, row: Locator) {
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), piece);
  await expect(form).toBeHidden();
  await expect(row).toBeVisible();
  await dismissToast(page);
}

const wishlist: Surface = {
  async open(page) {
    await page.goto("/wishlist");
    await expect(page).toHaveURL(/\/wishlist$/);
    await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
  },
  async addItem(page, name, category) {
    await page.getByRole("button", { name: "Add item" }).click();
    const form = page.getByRole("dialog", { name: "New item" });
    await form.getByLabel("Name", { exact: true }).fill(name);
    await form.getByLabel("Price (RON)").fill("100");
    await form.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: label(category) });
    await saveItem(page, form, `"name":"${name}"`, this.item(page, name));
  },
  item: (page, name) => page.getByText(name, { exact: true }),
};

// The page opens on the Daily tab of the Personal space, the only list with a categories card.
const tasksDaily: Surface = {
  async open(page) {
    await page.goto("/todos");
    await expect(page).toHaveURL(/\/todos$/);
    await page.getByRole("tab", { name: "Daily", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
  },
  async addItem(page, name, category) {
    await page.getByRole("button", { name: "Add task" }).click();
    const form = page.getByRole("dialog", { name: "New daily task" });
    await form.getByLabel("Title").fill(name);
    await form.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: label(category) });
    await saveItem(page, form, `"title":"${name}"`, this.item(page, name));
  },
  item: (page, name) => page.getByText(name, { exact: true }),
};

const healthShopping: Surface = {
  async open(page) {
    await page.goto("/health");
    await expect(page).toHaveURL(/\/health$/);
    await page.getByRole("tab", { name: /^Shop(ping)?$/ }).click();
    await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
  },
  async addItem(page, name, category) {
    await page.getByRole("button", { name: "Add item" }).click();
    const form = page.getByRole("dialog", { name: "New shopping item" });
    await form.getByLabel("Name", { exact: true }).fill(name);
    await form.getByRole("combobox", { name: "Category", exact: true }).selectOption({ label: label(category) });
    await saveItem(page, form, `"name":"${name}"`, this.item(page, name));
  },
  // A shopping row is one text, "<name> · 1 pcs", so the row is found by its Edit button.
  item: (page, name) => page.getByRole("button", { name: `Edit ${name}`, exact: true }),
};

async function addCategory(page: Page, name: string) {
  await page.getByRole("button", { name: "Add category" }).click();
  const form = page.getByRole("dialog", { name: "New category" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"name":"${name}"`);
  await expect(form).toBeHidden();
  await expect(page.getByText(`Added "${name}"`, { exact: true })).toBeVisible();
}

// Renames `from` to `to`; an existing `to` makes it a merge. The request body names the new name.
async function renameCategory(page: Page, from: string, to: string) {
  await page.getByRole("button", { name: `Edit category ${from}`, exact: true }).click();
  const form = page.getByRole("dialog", { name: "Edit category" });
  await form.getByLabel("Name", { exact: true }).fill(to);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"to":"${to}"`);
  await expect(form).toBeHidden();
  await expect(page.getByText(`Renamed "${from}" to "${to}"`, { exact: true })).toBeVisible();
}

async function deleteCategory(page: Page, name: string) {
  await andSettle(page, () => page.getByRole("button", { name: `Delete category ${name}`, exact: true }).click(), `"name":"${name}"`);
  await expect(page.getByText(`Removed "${name}"; its items are in Other`, { exact: true })).toBeVisible();
}

// `piece` is the part of the request body that tells the Undo's write apart from an earlier reload: the name of an
// undone add (it is a delete), "dropCurrent" for an undone rename or delete (it is a revert).
async function undo(page: Page, piece: string) {
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click(), piece);
}

// What the screen must show: `rows` are in the Categories card, `gone` are not, and each item is filed under its category.
interface State {
  rows: string[];
  gone: string[];
  items: [item: string, category: string][];
}

// Every item is visible and its group heading is there; with `folding`, pressing that heading hides the item and
// pressing it again shows it, which proves the item is filed under that heading. It runs after a reload, where no
// toast is open (a toast would not block the click, but its Undo must stay for the step that uses it).
async function expectState(surface: Surface, page: Page, state: State, folding: boolean) {
  for (const row of state.rows) await expect(card(page).getByText(row, { exact: true })).toBeVisible();
  for (const row of state.gone) {
    await expect(card(page).getByText(row, { exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: label(row), exact: true })).toBeHidden();
  }
  for (const [item, category] of state.items) {
    const heading = page.getByRole("button", { name: label(category), exact: true });
    const row = surface.item(page, item);
    await expect(heading).toBeVisible();
    await expect(row).toBeVisible();
    if (!folding) continue;
    await heading.click();
    await expect(heading).toHaveAttribute("aria-expanded", "false");
    await expect(row).toBeHidden();
    await heading.click();
    await expect(row).toBeVisible();
  }
}

// Reloads the page and checks the state again, so a write the optimistic screen hid would fail here.
async function expectAfterReload(surface: Surface, page: Page, state: State) {
  await surface.open(page);
  await expectState(surface, page, state, true);
}

async function runCategoryFlow(surface: Surface, page: Page) {
  const [a, b, c] = [`e2e-cat-${hex()}`, `e2e-cat-${hex()}`, `e2e-cat-${hex()}`];
  const [item1, item2] = [`E2E item ${hex()}`, `E2E item ${hex()}`];
  await surface.open(page);

  // Add, then Undo the add: the row goes, also after a reload. Add again: it stays after a reload.
  await addCategory(page, a);
  await expectState(surface, page, { rows: [a], gone: [], items: [] }, false);
  await undo(page, `"name":"${a}"`);
  await expectState(surface, page, { rows: [], gone: [a], items: [] }, false);
  await expectAfterReload(surface, page, { rows: [], gone: [a], items: [] });
  await addCategory(page, a);
  await dismissToast(page);
  await expectAfterReload(surface, page, { rows: [a], gone: [], items: [] });

  // An item filed under each of two categories.
  await surface.addItem(page, item1, a);
  await addCategory(page, b);
  await dismissToast(page);
  await surface.addItem(page, item2, b);
  const filed: State = { rows: [a, b], gone: [c], items: [[item1, a], [item2, b]] };
  await expectAfterReload(surface, page, filed);

  // Rename a to c: the item follows. Undo puts a back with its item; renaming again is saved after a reload.
  const renamed: State = { rows: [b, c], gone: [a], items: [[item1, c], [item2, b]] };
  await renameCategory(page, a, c);
  await expectState(surface, page, renamed, false);
  await undo(page, `"dropCurrent"`);
  await expectState(surface, page, filed, false);
  await expectAfterReload(surface, page, filed);
  await renameCategory(page, a, c);
  await expectAfterReload(surface, page, renamed);

  // Rename c to b, a name that exists: the two merge. Undo gives c back with its own item only; the merge is saved after a reload.
  const merged: State = { rows: [b], gone: [a, c], items: [[item1, b], [item2, b]] };
  await renameCategory(page, c, b);
  await expectState(surface, page, merged, false);
  await undo(page, `"dropCurrent"`);
  await expectState(surface, page, renamed, false);
  await expectAfterReload(surface, page, renamed);
  await renameCategory(page, c, b);
  await expectAfterReload(surface, page, merged);

  // Delete b while two items are filed under it: they move to Other. Undo files exactly those back; the delete is saved after a reload.
  const deleted: State = { rows: [], gone: [a, b, c], items: [[item1, "other"], [item2, "other"]] };
  await deleteCategory(page, b);
  await expectState(surface, page, deleted, false);
  await undo(page, `"dropCurrent"`);
  await expectState(surface, page, merged, false);
  await expectAfterReload(surface, page, merged);
  await deleteCategory(page, b);
  await expectAfterReload(surface, page, deleted);
}

// A scan with the Edit category form open, then with the New category form open.
async function scanWithForms(surface: Surface, page: Page) {
  const name = `e2e-cat-${hex()}`;
  await surface.open(page);
  await addCategory(page, name);
  await dismissToast(page);
  await expectNoSeriousViolations(page);
  await page.getByRole("button", { name: `Edit category ${name}`, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit category" })).toBeVisible();
  await expectNoSeriousViolations(page);
  await page.getByRole("button", { name: "Close modal" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("dialog", { name: "New category" })).toBeVisible();
  await expectNoSeriousViolations(page);
}

// Tests tagged @a11y run on every project (desktop and phone width, dark and light); the rest run on desktop only, because only the
// axe scan depends on the width and the color scheme (see playwright.config.ts). The flow is long (about 40 steps, each waiting for the
// server), so it gets the longer slow-test timeout.
test("the Wishlist categories card adds, renames, merges and deletes, with Undo, also after a reload", async ({ signedInPage: page }) => {
  test.slow();
  await runCategoryFlow(wishlist, page);
});

test("the Tasks Daily categories card adds, renames, merges and deletes, with Undo, also after a reload", async ({ signedInPage: page }) => {
  test.slow();
  await runCategoryFlow(tasksDaily, page);
});

test("the Health shopping categories card adds, renames, merges and deletes, with Undo, also after a reload", async ({ signedInPage: page }) => {
  test.slow();
  await runCategoryFlow(healthShopping, page);
});

test("the Wishlist categories card has no serious violations, with its forms open", { tag: "@a11y" }, async ({ signedInPage: page }) => {
  await scanWithForms(wishlist, page);
});

test("the Tasks Daily categories card has no serious violations, with its forms open", { tag: "@a11y" }, async ({ signedInPage: page }) => {
  await scanWithForms(tasksDaily, page);
});

test("the Health shopping categories card has no serious violations, with its forms open", { tag: "@a11y" }, async ({ signedInPage: page }) => {
  await scanWithForms(healthShopping, page);
});
