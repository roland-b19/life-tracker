import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import { andSettle, asOwner, burst, center, countWrites, dismissToast, expectNoSeriousViolations, expectToastWithoutUndo, holdWrites, itemName, openWishlist, pauseClock, signedInUserId, signOutHere, tapAfter, test, toast, undoIn } from "./helpers";

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

// Saves the open item form and waits for the action's answer; `piece` names the item in the request body.
async function saveItem(page: Page, form: Locator, piece: string, row: Locator) {
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), piece);
  await expect(form).toBeHidden();
  await expect(row).toBeVisible();
  await dismissToast(page);
}

const wishlist: Surface = {
  open: openWishlist,
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
  // A shopping row's name and quantity are two lines, so the row is found by its Edit button.
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

// `piece` is the part of the request body that names the Undo's write: the name of an undone add (it is a delete),
// "dropCurrent" for an undone rename or delete (it is a revert).
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
  const [item1, item2] = [itemName(), itemName()];
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

// A double tap acts once: on Save it adds one category, on Delete it removes only that row, never the one that slides up
// under the finger once the first tap has removed it.
test("the categories card's buttons act once on a double tap", async ({ signedInPage: page }) => {
  const [a, b] = [`e2e-cat-${hex()}`, `e2e-cat-${hex()}`];
  await wishlist.open(page);
  await page.getByRole("button", { name: "Add category" }).click();
  const form = page.getByRole("dialog", { name: "New category" });
  await form.getByLabel("Name", { exact: true }).fill(a);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).dblclick(), `"name":"${a}"`);
  await expect(form).toBeHidden();
  await expect(page.getByText(`Added "${a}"`, { exact: true })).toBeVisible();
  await dismissToast(page);
  await addCategory(page, b);
  await dismissToast(page);
  await expect(card(page).locator(".entry-row")).toHaveCount(2);

  await andSettle(page, () => page.getByRole("button", { name: `Delete category ${a}`, exact: true }).dblclick(), `"name":"${a}"`);
  await expect(page.getByText(`Removed "${a}"; its items are in Other`, { exact: true })).toBeVisible();
  await expect(card(page).getByText(b, { exact: true })).toBeVisible();
  await wishlist.open(page);
  await expect(card(page).locator(".entry-row")).toHaveCount(1);
  await expect(card(page).getByText(b, { exact: true })).toBeVisible();
});

// Turns off Chromium's scroll anchoring, which iPhone Safari does not have: with it, a removed row above the anchor
// scrolls the page instead of letting the next row slide up into its place, which hides the case under test.
async function slideLikeSafari(page: Page) {
  await page.addStyleTag({ content: "* { overflow-anchor: none }" });
}

// Where a button of the toast (`button`) opens on this screen: a first delete, of `probe`, shows it. Shift ends that
// delete's burst (a keydown does), so this setup step does not lean on the case under test.
async function toastButtonAt(page: Page, probe: string, button: Locator) {
  await deleteCategory(page, probe);
  const at = center(await button.boundingBox());
  await page.keyboard.press("Shift");
  await dismissToast(page);
  return at;
}

// The second click of a burst is swallowed where the first landed: it neither deletes the row that slid up under it,
// nor, after Save, opens the Edit form of the row under the closed dialog. Both at desktop and at phone width.
for (const size of [
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
]) {
  test(`the categories card acts once on two quick clicks, at ${size.width} wide`, async ({ signedInPage: page }) => {
    test.slow();
    await page.setViewportSize(size);
    const [a, b, c] = [`e2e-cat-${hex()}`, `e2e-cat-${hex()}`, `e2e-cat-${hex()}`];
    // Rows after b make the page tall enough to scroll the rows up on a phone screen.
    const fillers = [`e2e-cat-${hex()}`, `e2e-cat-${hex()}`, `e2e-cat-${hex()}`];
    await wishlist.open(page);
    for (const name of [a, b, ...fillers]) {
      await addCategory(page, name);
      await dismissToast(page);
    }

    // Delete. The page is scrolled up to 100 px short of its end: on a phone that lifts the row above the toast that
    // opens at the bottom (it would take the second click), and the page left below means the shorter list does not
    // pull the page up under the finger. Without scroll anchoring b's Delete slides up under the second click.
    await slideLikeSafari(page);
    const remove = page.getByRole("button", { name: `Delete category ${a}`, exact: true });
    await page.evaluate(() => window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight - 100)));
    await expect(remove).toBeInViewport();
    const removeAt = center(await remove.boundingBox());
    expect(await burst(page, removeAt)).toBe(1);
    await expect(page.getByText(`Removed "${a}"; its items are in Other`, { exact: true })).toBeVisible();
    await expect(card(page).getByText(b, { exact: true })).toBeVisible();
    // b's Delete is where the second click landed: the guard, not a miss, kept it.
    const slid = center(await page.getByRole("button", { name: `Delete category ${b}`, exact: true }).boundingBox());
    expect(Math.abs(slid.y - removeAt.y)).toBeLessThan(10);
    await dismissToast(page);

    // Save, with b's Edit button lined up under it, as it was at 1280 wide when the case was found. The page cannot
    // scroll while the form is open, so it is lined up first; the form opens without a scroll (a dispatched click).
    const add = page.getByRole("button", { name: "Add category" });
    const form = page.getByRole("dialog", { name: "New category" });
    await add.click();
    const saveBox = await form.getByRole("button", { name: "Save" }).boundingBox();
    const save = center(saveBox);
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(form).toBeHidden();
    const edit = page.getByRole("button", { name: `Edit category ${b}`, exact: true });
    await page.evaluate((dy) => window.scrollBy(0, dy), center(await edit.boundingBox()).y - save.y);
    const spot = { x: center(await edit.boundingBox()).x, y: save.y };
    expect(Math.abs(center(await edit.boundingBox()).y - spot.y)).toBeLessThan(10);
    expect(spot.x).toBeGreaterThan(saveBox!.x);
    expect(spot.x).toBeLessThan(saveBox!.x + saveBox!.width);
    await add.dispatchEvent("click");
    await form.getByLabel("Name", { exact: true }).fill(c);
    expect(await burst(page, spot)).toBe(1);
    await expect(page.getByText(`Added "${c}"`, { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await wishlist.open(page);
    await expect(card(page).locator(".entry-row")).toHaveCount(5);
    for (const name of [b, c, ...fillers]) await expect(card(page).getByText(name, { exact: true })).toBeVisible();
    await expect(card(page).getByText(a, { exact: true })).toBeHidden();
  });
}

// The double-tap lock is per row (D-043): a tap on another row's Delete while a delete is still unanswered deletes that
// row too. Next sends it once the first one answers, so the first delete's answer is held until both taps are in. The
// release waits for the second delete's answer, which comes after the first's: a reload while it is on its way aborts it.
test("the categories card deletes another row while a delete is unanswered", async ({ signedInPage: page }) => {
  const [a, b] = [`e2e-cat-${hex()}`, `e2e-cat-${hex()}`];
  await wishlist.open(page);
  for (const name of [a, b]) {
    await addCategory(page, name);
    await dismissToast(page);
  }
  const writes = countWrites(page);
  const deleted = () => writes.flatMap((r) => [a, b].filter((name) => (r.postData() ?? "").includes(`"name":"${name}"`)));
  const release = await holdWrites(page, `"name":"${a}"`);

  await page.getByRole("button", { name: `Delete category ${a}`, exact: true }).click();
  await expect.poll(deleted).toEqual([a]);
  // A keydown ends the tap burst, so only the lock could stand in the way of the next tap.
  await page.keyboard.press("Shift");
  await page.getByRole("button", { name: `Delete category ${b}`, exact: true }).click();
  await expect(card(page).getByText(b, { exact: true })).toBeHidden();
  await andSettle(page, async () => release(), `"name":"${b}"`);
  await expect(page.getByText(`Removed "${a}"; its items are in Other`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Removed "${b}"; its items are in Other`, { exact: true })).toBeVisible();
  expect(deleted()).toEqual([a, b]);

  await wishlist.open(page);
  await expect(card(page).locator(".entry-row")).toHaveCount(0);
});

// A rename keeps its opening while it is out (D-047), but only for its own category: Edit on another category, or Add,
// opened meanwhile is a fresh opening with its own name, enabled. Opening the renamed category again, after those, waits
// for the rename with the name it sent, and the answer closes it.
test("the categories card keeps a rename's opening only for the same category [D-047]", async ({ signedInPage: page }) => {
  const [a, b, x] = [`e2e-cat-${hex()}`, `e2e-cat-${hex()}`, `e2e-cat-${hex()}`];
  await wishlist.open(page);
  for (const name of [a, b]) {
    await addCategory(page, name);
    await dismissToast(page);
  }
  const writes = countWrites(page, `"to":"${x}"`);
  const release = await holdWrites(page, `"to":"${x}"`);
  const edit = page.getByRole("dialog", { name: "Edit category" });
  const field = edit.getByLabel("Name", { exact: true });
  await page.getByRole("button", { name: `Edit category ${a}`, exact: true }).click();
  await field.fill(x);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await edit.getByRole("button", { name: "Cancel" }).click();
  await expect(edit).toBeHidden();

  await page.getByRole("button", { name: `Edit category ${b}`, exact: true }).click();
  await expect(field).toHaveValue(b);
  await expect(field).toBeEnabled();
  await expect(edit.getByRole("button", { name: "Save" })).toBeEnabled();
  await edit.getByRole("button", { name: "Cancel" }).click();
  await expect(edit).toBeHidden();

  await page.getByRole("button", { name: "Add category" }).click();
  const add = page.getByRole("dialog", { name: "New category" });
  await expect(add.getByLabel("Name", { exact: true })).toHaveValue("");
  await expect(add.getByLabel("Name", { exact: true })).toBeEnabled();
  await add.getByRole("button", { name: "Cancel" }).click();
  await expect(add).toBeHidden();

  await page.getByRole("button", { name: `Edit category ${a}`, exact: true }).click();
  await expect(edit.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await expect(field).toBeDisabled();
  await expect(field).toHaveValue(x);
  await andSettle(page, async () => release(), `"to":"${x}"`);
  await expect(edit).toBeHidden();
  await expect(page.getByText(`Renamed "${a}" to "${x}"`, { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
});

// Each category's unanswered rename is kept on its own (D-047): another category renamed while the first rename is out
// (Next sends it once the first one answers) leaves the first one's opening as it was, so opened again it still waits
// with the name it sent. A fresh opening there would show the old name, and its Save would be refused as changed on
// another device.
test("the categories card opened again after another category's rename still waits with the name it sent [D-047]", async ({ signedInPage: page }) => {
  const [a, b, x, y] = [`e2e-cat-${hex()}`, `e2e-cat-${hex()}`, `e2e-cat-${hex()}`, `e2e-cat-${hex()}`];
  await wishlist.open(page);
  for (const name of [a, b]) {
    await addCategory(page, name);
    await dismissToast(page);
  }
  const release = await holdWrites(page, `"to":"${x}"`);
  const edit = page.getByRole("dialog", { name: "Edit category" });
  const field = edit.getByLabel("Name", { exact: true });
  await page.getByRole("button", { name: `Edit category ${a}`, exact: true }).click();
  await field.fill(x);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await edit.getByRole("button", { name: "Cancel" }).click();
  await expect(edit).toBeHidden();

  await page.getByRole("button", { name: `Edit category ${b}`, exact: true }).click();
  await expect(field).toHaveValue(b);
  await field.fill(y);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await edit.getByRole("button", { name: "Cancel" }).click();
  await expect(edit).toBeHidden();

  await page.getByRole("button", { name: `Edit category ${a}`, exact: true }).click();
  await expect(edit.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await expect(field).toBeDisabled();
  await expect(field).toHaveValue(x);
  // The second rename goes once the first one answers, so its answer comes last.
  await andSettle(page, async () => release(), `"to":"${y}"`);
  await expect(edit).toBeHidden();
  await expect(page.getByText(`Renamed "${a}" to "${x}"`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Renamed "${b}" to "${y}"`, { exact: true })).toBeVisible();
  await expect(card(page).getByText(x, { exact: true })).toBeVisible();
  await expect(card(page).getByText(y, { exact: true })).toBeVisible();
  const user = await signedInUserId(page);
  const { rows } = await asOwner((db) => db.query("SELECT name FROM item_categories WHERE user_id = $1 ORDER BY name", [user]));
  expect(rows.map((r) => r.name)).toEqual([x, y].sort());
});

// A phone screen with the card holding `names`, in that order, and three more rows after them, so the page is tall
// enough to scroll the rows up to where the toast opens.
async function onPhoneWith(page: Page, names: string[]) {
  await page.setViewportSize({ width: 375, height: 812 });
  await wishlist.open(page);
  for (const name of [...names, `e2e-cat-${hex()}`, `e2e-cat-${hex()}`, `e2e-cat-${hex()}`]) {
    await addCategory(page, name);
    await dismissToast(page);
  }
}

// The case found on a phone: the toast's Undo opens over the deleted row's place, and a quick tap on it brings the
// category back.
test("the categories card takes a quick Undo tap after a Delete on a phone", async ({ signedInPage: page }) => {
  test.slow();
  const [a, probe] = [`e2e-cat-${hex()}`, `e2e-cat-${hex()}`];
  await onPhoneWith(page, [probe, a]);
  const undoButton = page.getByRole("button", { name: "Undo" });
  const undoAt = await toastButtonAt(page, probe, undoButton);

  // a's row lined up under the Undo, as the toast opens over it.
  const row = card(page).locator(".entry-row", { hasText: a });
  await page.evaluate((dy) => window.scrollBy(0, dy), center(await row.boundingBox()).y - undoAt.y);
  const rowBox = (await row.boundingBox())!;
  expect(undoAt.y).toBeGreaterThan(rowBox.y);
  expect(undoAt.y).toBeLessThan(rowBox.y + rowBox.height);

  // Delete, then Undo about 100 ms later, well within the burst.
  const remove = center(await row.getByRole("button", { name: `Delete category ${a}`, exact: true }).boundingBox());
  const started = Date.now();
  await andSettle(page, () => page.mouse.click(remove.x, remove.y), `"name":"${a}"`);
  await expect(undoButton).toBeVisible();
  let tapped = Infinity;
  await andSettle(page, async () => void (tapped = await tapAfter(page, started, 100, undoButton)), "dropCurrent");
  expect(tapped).toBeLessThan(400);
  await expect(card(page).getByText(a, { exact: true })).toBeVisible();

  // The server has it back too.
  await wishlist.open(page);
  await expect(card(page).getByText(a, { exact: true })).toBeVisible();
  await expect(card(page).locator(".entry-row")).toHaveCount(4);
});

// A tap on the toast goes through even inside the guarded button's place: on a phone the toast's Dismiss opens right
// over the deleted row's Delete button.
test("the categories card takes a quick Dismiss tap over the deleted row's Delete button", async ({ signedInPage: page }) => {
  test.slow();
  const [a, probe] = [`e2e-cat-${hex()}`, `e2e-cat-${hex()}`];
  // A row before a puts it low enough on the page for its Delete to scroll under the Dismiss.
  await onPhoneWith(page, [probe, `e2e-cat-${hex()}`, a]);
  const dismissAt = await toastButtonAt(page, probe, dismissButton(page));

  // a's Delete lined up under the Dismiss.
  const remove = card(page).getByRole("button", { name: `Delete category ${a}`, exact: true });
  await page.evaluate((dy) => window.scrollBy(0, dy), center(await remove.boundingBox()).y - dismissAt.y);
  const box = (await remove.boundingBox())!;
  expect(dismissAt.x).toBeGreaterThan(box.x);
  expect(dismissAt.x).toBeLessThan(box.x + box.width);
  expect(dismissAt.y).toBeGreaterThan(box.y);
  expect(dismissAt.y).toBeLessThan(box.y + box.height);

  // Delete, then Dismiss about 50 ms later, well within the burst.
  const started = Date.now();
  await andSettle(page, () => page.mouse.click(dismissAt.x, dismissAt.y), `"name":"${a}"`);
  await expect(dismissButton(page)).toBeVisible();
  expect(await tapAfter(page, started, 50, dismissButton(page))).toBeLessThan(400);
  // The mouse over the toast holds it open, so only the Dismiss can close it; the bound stays under its own 5 s anyway.
  await expect(dismissButton(page)).toHaveCount(0, { timeout: 2_000 });
});

// The guard covers only the tapped Delete button, not the deleted row's whole place: a quick tap beside it, here on the
// next row's Edit once it has slid up there, goes through and opens that row's form.
test("the categories card takes a quick tap beside the deleted row's Delete button", async ({ signedInPage: page }) => {
  test.slow();
  const [a, b] = [`e2e-cat-${hex()}`, `e2e-cat-${hex()}`];
  await onPhoneWith(page, [a, b]);
  await slideLikeSafari(page);
  // As in the two-quick-clicks test: 100 px short of the end lifts the row above the toast, and the shorter list does
  // not pull the page up.
  await page.evaluate(() => window.scrollTo(0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight - 100)));
  const row = card(page).locator(".entry-row", { hasText: a });
  await expect(row).toBeInViewport();
  const editAt = center(await row.getByRole("button", { name: `Edit category ${a}`, exact: true }).boundingBox());
  const remove = center(await row.getByRole("button", { name: `Delete category ${a}`, exact: true }).boundingBox());

  const started = Date.now();
  await andSettle(page, () => page.mouse.click(remove.x, remove.y), `"name":"${a}"`);
  await expect(row).toHaveCount(0);
  // b's Edit has slid up into a's Edit's place.
  const slid = center(await page.getByRole("button", { name: `Edit category ${b}`, exact: true }).boundingBox());
  expect(Math.abs(slid.y - editAt.y)).toBeLessThan(10);
  expect(Date.now() - started).toBeLessThan(400);
  await page.mouse.click(editAt.x, editAt.y);
  const form = page.getByRole("dialog", { name: "Edit category" });
  await expect(form).toBeVisible();
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue(b);
});

// Each Undo toast names the category rows it touches (D-040): a newer toast touching the same category takes the older
// toast's Undo away, so the older Undo never writes over the newer change; toasts about other categories keep theirs.
// The page's clock stands still from the rename to the check, so the rename's toast does not run out.
test("the categories card's older toast loses its Undo to a newer one about the same category", async ({ signedInPage: page }) => {
  const [a, b, c, d, e] = [`e2e-cat-${hex()}`, `e2e-cat-${hex()}`, `e2e-cat-${hex()}`, `e2e-cat-${hex()}`, `e2e-cat-${hex()}`];
  await page.clock.install();
  await wishlist.open(page);
  for (const name of [a, c, d]) {
    await addCategory(page, name);
    await dismissToast(page);
  }
  await pauseClock(page);

  // The same category: rename a to b, then delete b. The closed form's Save lay over a row's Delete, so Shift ends the
  // Save's tap burst (D-043) first; this test is about the toasts, not the guard.
  await renameCategory(page, a, b);
  await expect(undoIn(page, `Renamed "${a}" to "${b}"`)).toBeVisible();
  await page.keyboard.press("Shift");
  await deleteCategory(page, b);
  await expect(undoIn(page, `Removed "${b}"`)).toBeVisible();
  await expectToastWithoutUndo(page, `Renamed "${a}" to "${b}"`);
  await page.clock.resume();
  for (const message of [`Renamed "${a}"`, `Removed "${b}"`]) await toast(page, message).getByRole("button", { name: "Dismiss notification" }).click();
  await expect(dismissButton(page)).toHaveCount(0);

  // Two categories: rename c to e, then delete d.
  await renameCategory(page, c, e);
  await page.keyboard.press("Shift");
  await deleteCategory(page, d);
  await expect(undoIn(page, `Renamed "${c}" to "${e}"`)).toBeVisible();
  await expect(undoIn(page, `Removed "${d}"`)).toBeVisible();
});

// A toast shows when the screen shows the change (D-047): a move and a delete change the screen at once, so their toasts
// do not wait for the server. An Undo tapped before the delete answers waits for it, then puts the row back.
test("the categories card's move and delete show their toast before the server answers [D-047]", async ({ signedInPage: page }) => {
  const [a, b] = [`e2e-cat-${hex()}`, `e2e-cat-${hex()}`];
  await wishlist.open(page);
  for (const name of [a, b]) {
    await addCategory(page, name);
    await dismissToast(page);
  }
  const rows = card(page).locator(".category-name");

  let release = await holdWrites(page, `"names":`);
  await card(page).getByRole("button", { name: `Drag ${b} to reorder`, exact: true }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(rows).toHaveText([b, a]);
  await expect(undoIn(page, `Moved "${b}"`)).toBeVisible();
  await andSettle(page, async () => release(), `"names":`);
  await dismissToast(page);

  release = await holdWrites(page, `"name":"${a}"`);
  await page.getByRole("button", { name: `Delete category ${a}`, exact: true }).click();
  await expect(rows).toHaveText([b]);
  await undoIn(page, `Removed "${a}"; its items are in Other`).click();
  await andSettle(page, async () => release(), "dropCurrent");
  await expect(rows).toHaveText([b, a]);

  await wishlist.open(page);
  await expect(rows).toHaveText([b, a]);
});

// A one-word name of a usual length stays on one line at phone width on every page with the card; only a name longer
// than the line breaks (overflow-wrap: anywhere).
test("the categories card keeps a one-word name on one line on a phone", async ({ signedInPage: page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const surface of [tasksDaily, wishlist, healthShopping]) {
    await surface.open(page);
    await addCategory(page, "browsercheck");
    await dismissToast(page);
    const name = card(page).locator(".category-name", { hasText: "browsercheck" });
    const { height, lineHeight } = await name.evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    }));
    expect(height, page.url()).toBeLessThan(1.5 * lineHeight);
  }
});

// A refused write shows the server's own message (D-040), not a generic "Failed to ...".
test("the categories card shows why the server refused a delete or an Undo", async ({ signedInPage: page }) => {
  const [a, b, c] = [`e2e-cat-${hex()}`, `e2e-cat-${hex()}`, `e2e-cat-${hex()}`];
  await wishlist.open(page);
  await addCategory(page, a);
  await dismissToast(page);

  // A stale Undo: another tab renames the category the Undo would take back, so the server refuses it.
  await renameCategory(page, a, b);
  const undoButton = page.getByRole("button", { name: "Undo" });
  await undoButton.hover(); // keeps the toast open meanwhile
  const other = await page.context().newPage();
  await wishlist.open(other);
  await renameCategory(other, b, c);
  await other.close();
  await undo(page, "dropCurrent");
  await expect(page.getByText(`Can't undo: "${b}" has changed since.`, { exact: true })).toBeVisible();
  await dismissToast(page);

  // Signed out: the delete is refused with the sign-in message and changes nothing: the row stays on the page, and the
  // category in the database. The page's refresh, done before the sign-out, shows the other tab's name.
  const user = await signedInUserId(page);
  await signOutHere(page);
  await andSettle(page, () => page.getByRole("button", { name: `Delete category ${c}`, exact: true }).click(), `"name":"${c}"`);
  await expect(page.getByText("You're signed out. Sign in again.", { exact: true })).toBeVisible();
  await expect(card(page).getByText(c, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/wishlist$/);
  expect((await asOwner((db) => db.query("SELECT name FROM item_categories WHERE user_id = $1", [user]))).rows).toEqual([{ name: c }]);
});

// A name over the limit is kept as typed, the form says why, and nothing is saved.
test("the categories card refuses a name over 50 characters without cutting it", async ({ signedInPage: page }) => {
  const long = `e2e-${"x".repeat(56)}`;
  await wishlist.open(page);
  await page.getByRole("button", { name: "Add category" }).click();
  const form = page.getByRole("dialog", { name: "New category" });
  const field = form.getByLabel("Name", { exact: true });
  await field.fill(long);
  await expect(field).toHaveValue(long);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"name":"${long}"`);
  await expect(form.getByRole("alert")).toHaveText("Too long (max 50)");
  await expect(field).toHaveValue(long);
  await expect(card(page).locator(".entry-row")).toHaveCount(0);

  await wishlist.open(page);
  await expect(card(page).locator(".entry-row")).toHaveCount(0);
});

// An answer belongs to its opening (D-047): an add lost after its form was cancelled says so in a toast, and the form
// opened next starts with no error.
test("a category save lost after Cancel shows as a toast, not in the form [D-047]", async ({ signedInPage: page }) => {
  const name = `e2e-cat-${hex()}`;
  await wishlist.open(page);
  const release = await holdWrites(page, `"name":"${name}"`);
  await page.getByRole("button", { name: "Add category" }).click();
  const form = page.getByRole("dialog", { name: "New category" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();
  await release(true);
  await expect(toast(page, "Failed to save category")).toBeVisible();

  await page.getByRole("button", { name: "Add category" }).click();
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue("");
  await expect(form.getByRole("alert")).toHaveCount(0);
  await expect(card(page).locator(".entry-row")).toHaveCount(0);
});

// The card's fold is kept on the device (useDeviceState), so it is still folded after a reload.
test("the categories card stays folded after a reload", async ({ signedInPage: page }) => {
  const name = `e2e-cat-${hex()}`;
  await wishlist.open(page);
  await addCategory(page, name);
  await dismissToast(page);
  const fold = card(page).getByRole("button", { name: "Show categories" });
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(card(page).getByText(name, { exact: true })).toBeHidden();

  await wishlist.open(page);
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(card(page).getByText(name, { exact: true })).toBeHidden();
  await fold.click();
  await expect(card(page).getByText(name, { exact: true })).toBeVisible();
  await wishlist.open(page);
  await expect(fold).toHaveAttribute("aria-expanded", "true");
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
