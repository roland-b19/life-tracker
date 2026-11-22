import { MEAL_CALORIES_NEGATIVE, MEAL_MACROS_NEGATIVE } from "../../src/lib/validations/food";
import { randomUUID } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { Pool } from "pg";
import { andSettle, burst, center, expectNoSeriousViolations, isRefresh, refreshesDone, settled, test } from "./helpers";

// The open tab is kept per device (HTODAY-17), so a reload opens the tab picked last: each open picks its tab. A click
// before the page has hydrated is lost, so the pick is tried until the tab is selected. On a phone the Shopping tab
// shows its short label "Shop", hence the pattern.
const TABS = { Today: "Today", Shopping: /^Shop(ping)?$/ } as const;

async function openHealth(page: Page, tab: "Today" | "Shopping") {
  await page.goto("/health");
  await expect(page).toHaveURL(/\/health$/);
  const pick = page.getByRole("tab", { name: TABS[tab] });
  await expect(async () => {
    await pick.click();
    await expect(pick).toHaveAttribute("aria-selected", "true", { timeout: 1000 });
  }).toPass();
  await expect(page.getByRole("button", { name: tab === "Today" ? "Add meal" : "Add item" })).toBeVisible();
}

async function dismissToast(page: Page, message: string) {
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByText(message)).toBeHidden();
}

// The meal form has no name field; the server names the meal "Meal". Its numbers are two lines under the name; its
// Delete names the meal, its time and its calories (HTODAY-12).
const MEAL_NUMBERS = "450 kcal · P 30";
const deleteMeal = (kcal: string) => new RegExp(`^Delete Meal of \\d\\d:\\d\\d, ${kcal.replace(".", "\\.")} kcal$`);

async function addMeal(page: Page) {
  await page.getByRole("button", { name: "Add meal" }).click();
  const form = page.getByRole("dialog", { name: "New meal" });
  await form.getByLabel("Calories (kcal)").fill("450");
  await form.getByLabel("Protein (g)").fill("30");
  await form.getByLabel("Carbs (g)").fill("40");
  await form.getByLabel("Fat (g)").fill("12");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form).toBeHidden();
  await expect(page.getByText("Added meal (450 kcal)")).toBeVisible();
  await expect(page.getByText(MEAL_NUMBERS, { exact: true })).toBeVisible();
}

const itemName = () => `E2E item ${randomUUID().slice(0, 8)}`;

// The quantity sits on the line under the name, so the row is the one whose Edit button names the item.
const itemLine = (page: Page, name: string, amount: number) =>
  page.locator(".shopping-row").filter({ has: page.getByRole("button", { name: `Edit ${name}`, exact: true }) }).getByText(`${amount} pcs`, { exact: true });

async function addItem(page: Page, name: string, amount: number, category?: string) {
  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New shopping item" });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Amount").fill(String(amount));
  if (category) await form.getByRole("combobox", { name: "Category" }).selectOption(category);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form).toBeHidden();
  await expect(page.getByText(`Added "${name}"`)).toBeVisible();
  await expect(itemLine(page, name, amount)).toBeVisible();
}

// Tests tagged @a11y run on every project (desktop and phone width, dark and light); the rest run on desktop only, because only the
// axe scan depends on the width and the color scheme (see playwright.config.ts).
test("the Today and Shopping tabs have no serious violations, also with a form open", { tag: "@a11y" }, async ({ signedInPage: page }) => {
  await openHealth(page, "Today");
  await addMeal(page);
  await expectNoSeriousViolations(page);
  await page.getByRole("button", { name: "Add meal" }).click();
  const mealForm = page.getByRole("dialog", { name: "New meal" });
  await expect(mealForm).toBeVisible();
  await expectNoSeriousViolations(page);
  await mealForm.getByRole("button", { name: "Cancel" }).click();
  await expect(mealForm).toBeHidden();

  await page.getByRole("tab", { name: /^Shop(ping)?$/ }).click();
  await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
  await addItem(page, itemName(), 2);
  await expectNoSeriousViolations(page);
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByRole("dialog", { name: "New shopping item" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("a signed-in user logs and deletes a meal, with Undo for each, also after a reload", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");

  const nutrition = page.getByRole("region", { name: "Nutrition" });
  const meal = page.getByText(MEAL_NUMBERS, { exact: true });
  const empty = page.getByText("No meals logged today.");

  // Log a meal: the row, the toast and the Nutrition card (the goals are the defaults).
  await expect(empty).toBeVisible();
  await addMeal(page);
  await expect(nutrition).toContainText(/Calories\s*450\s*\/ 3\.350 kcal/);

  // Undo the log: the meal is gone, also after a reload.
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(empty).toBeVisible();
  await expect(nutrition).toContainText(/Calories\s*0\s*\/ 3\.350 kcal/);
  await openHealth(page, "Today");
  await expect(empty).toBeVisible();

  // Log it again: it is still there after a reload, so the database has it.
  await addMeal(page);
  await dismissToast(page, "Added meal (450 kcal)");
  await openHealth(page, "Today");
  await expect(meal).toBeVisible();

  // Delete it, then Undo the delete: the same meal comes back, also after a reload.
  await andSettle(page, () => page.getByRole("button", { name: deleteMeal("450") }).click());
  await expect(empty).toBeVisible();
  await expect(page.getByText('Removed "Meal"')).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(meal).toBeVisible();
  await expect(nutrition).toContainText(/Calories\s*450\s*\/ 3\.350 kcal/);
  await openHealth(page, "Today");
  await expect(meal).toBeVisible();

  // Delete it for good: the database lost it.
  await andSettle(page, () => page.getByRole("button", { name: deleteMeal("450") }).click());
  await expect(empty).toBeVisible();
  await openHealth(page, "Today");
  await expect(empty).toBeVisible();
});

test("a signed-in user edits the nutrition goals, with Undo, also after a reload", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");

  const nutrition = page.getByRole("region", { name: "Nutrition" });
  const goals = (calories: string, protein: number, carbs: number, fat: number) =>
    Promise.all([
      expect(nutrition.getByText(`/ ${calories} kcal`, { exact: true })).toBeVisible(),
      expect(nutrition.getByText(`/ ${protein}g`, { exact: true })).toBeVisible(),
      expect(nutrition.getByText(`/ ${carbs}g`, { exact: true })).toBeVisible(),
      expect(nutrition.getByText(`/ ${fat}g`, { exact: true })).toBeVisible(),
    ]);
  const saveGoals = async () => {
    await nutrition.getByRole("button", { name: "Edit goals" }).click();
    const form = page.getByRole("dialog", { name: "Edit goals" });
    await form.getByLabel("Calories (kcal)").fill("2800");
    await form.getByLabel("Protein (g)").fill("150");
    await form.getByLabel("Carbs (g)").fill("250");
    await form.getByLabel("Fat (g)").fill("70");
    await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
    await expect(form).toBeHidden();
    await expect(page.getByText("Saved nutrition goals")).toBeVisible();
    await goals("2.800", 150, 250, 70);
  };

  // The defaults.
  await goals("3.350", 170, 300, 80);

  // Save new goals; Undo puts the defaults back, also after a reload.
  await saveGoals();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await goals("3.350", 170, 300, 80);
  await openHealth(page, "Today");
  await goals("3.350", 170, 300, 80);

  // Save them again: they are still the new ones after a reload.
  await saveGoals();
  await openHealth(page, "Today");
  await goals("2.800", 150, 250, 70);
});

test("a signed-in user adds water, sets water and steps with their goals, with Undo, also after a reload", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");

  const water = page.getByRole("region", { name: "Water" });
  const steps = page.getByRole("region", { name: "Steps" });

  await expect(water).toContainText("0 / 3.000 ml");
  await expect(steps).toContainText("0 / 10.000");

  // A quick tap adds at once; Undo takes exactly that back, also after a reload.
  await andSettle(page, () => water.getByRole("button", { name: "+250 ml" }).click());
  await expect(page.getByText("Added 250 ml")).toBeVisible();
  await expect(water).toContainText("250 / 3.000 ml");
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(water).toContainText("0 / 3.000 ml");
  await openHealth(page, "Today");
  await expect(water).toContainText("0 / 3.000 ml");

  // Tap again: 250 is what the database holds after a reload.
  await andSettle(page, () => water.getByRole("button", { name: "+250 ml" }).click());
  await dismissToast(page, "Added 250 ml");
  await openHealth(page, "Today");
  await expect(water).toContainText("250 / 3.000 ml");

  // Set the total and the goal: one write sends both (XR-09).
  await water.getByRole("button", { name: "Edit water and goal" }).click();
  const waterForm = page.getByRole("dialog", { name: "Edit water" });
  await expect(waterForm.getByLabel("Water today (ml)")).toHaveValue("250");
  await waterForm.getByLabel("Water today (ml)").fill("1200");
  await waterForm.getByLabel("Daily goal (ml)").fill("2500");
  await andSettle(page, () => waterForm.getByRole("button", { name: "Save" }).click());
  await expect(waterForm).toBeHidden();
  await expect(page.getByText("Water set to 1.200 ml, goal 2.500 ml")).toBeVisible();
  await expect(water).toContainText("1.200 / 2.500 ml");
  await openHealth(page, "Today");
  await expect(water).toContainText("1.200 / 2.500 ml");

  // Undo of an edit needs its toast, so edit once more and Undo it: total and goal both go back.
  await water.getByRole("button", { name: "Edit water and goal" }).click();
  await waterForm.getByLabel("Water today (ml)").fill("1800");
  await waterForm.getByLabel("Daily goal (ml)").fill("3500");
  await andSettle(page, () => waterForm.getByRole("button", { name: "Save" }).click());
  await expect(page.getByText("Water set to 1.800 ml, goal 3.500 ml")).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(water).toContainText("1.200 / 2.500 ml");
  await openHealth(page, "Today");
  await expect(water).toContainText("1.200 / 2.500 ml");

  // Steps: set the total and the goal, then Undo.
  await steps.getByRole("button", { name: "Edit steps and goal" }).click();
  const stepsForm = page.getByRole("dialog", { name: "Edit steps" });
  await stepsForm.getByLabel("Steps today").fill("8000");
  await stepsForm.getByLabel("Daily goal (steps)").fill("12000");
  await andSettle(page, () => stepsForm.getByRole("button", { name: "Save" }).click());
  await expect(stepsForm).toBeHidden();
  await expect(page.getByText("Steps set to 8.000, goal 12.000")).toBeVisible();
  await expect(steps).toContainText("8.000 / 12.000");
  await openHealth(page, "Today");
  await expect(steps).toContainText("8.000 / 12.000");

  await steps.getByRole("button", { name: "Edit steps and goal" }).click();
  await stepsForm.getByLabel("Steps today").fill("9500");
  await stepsForm.getByLabel("Daily goal (steps)").fill("15000");
  await andSettle(page, () => stepsForm.getByRole("button", { name: "Save" }).click());
  await expect(page.getByText("Steps set to 9.500, goal 15.000")).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(steps).toContainText("8.000 / 12.000");
  await openHealth(page, "Today");
  await expect(steps).toContainText("8.000 / 12.000");
});

test("a signed-in user adds, edits, ticks, clears and deletes a shopping item, with Undo for each, also after a reload", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");

  const name = itemName();
  const renamed = `${name} renamed`;
  const list = page.getByRole("region", { name: "Shopping list" });
  const tick = (n: string) => list.getByRole("button", { name: `Mark ${n} as bought` });
  const untick = (n: string) => list.getByRole("button", { name: `Mark ${n} as not bought` });

  // Add: the row with its amount and unit.
  await expect(page.getByText("Your shopping list is empty.")).toBeVisible();
  await addItem(page, name, 2);
  await dismissToast(page, `Added "${name}"`);
  await openHealth(page, "Shopping");
  await expect(itemLine(page, name, 2)).toBeVisible();

  // Edit the name and the amount; Undo puts the old ones back, also after a reload.
  await list.getByRole("button", { name: `Edit ${name}` }).click();
  const form = page.getByRole("dialog", { name: "Edit shopping item" });
  await form.getByLabel("Name").fill(renamed);
  await form.getByLabel("Amount").fill("3");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form).toBeHidden();
  await expect(page.getByText(`Saved "${renamed}"`)).toBeVisible();
  await expect(itemLine(page, renamed, 3)).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(itemLine(page, name, 2)).toBeVisible();
  await expect(itemLine(page, renamed, 3)).toBeHidden();
  await openHealth(page, "Shopping");
  await expect(itemLine(page, name, 2)).toBeVisible();

  // Tick, then Undo the tick; tick again and it is still bought after a reload.
  await andSettle(page, () => tick(name).click());
  await expect(page.getByText(`Bought "${name}"`)).toBeVisible();
  await expect(untick(name)).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(tick(name)).toBeVisible();
  await andSettle(page, () => tick(name).click());
  await dismissToast(page, `Bought "${name}"`);
  await openHealth(page, "Shopping");
  await expect(untick(name)).toBeVisible();

  // Clear the bought items, then Undo: the item comes back (still bought), also after a reload.
  await andSettle(page, () => page.getByRole("button", { name: "Clear bought" }).click());
  await expect(page.getByText("Cleared 1 bought item")).toBeVisible();
  await expect(page.getByText("Your shopping list is empty.")).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(untick(name)).toBeVisible();
  await openHealth(page, "Shopping");
  await expect(untick(name)).toBeVisible();

  // Delete, then Undo the delete: the same item comes back, also after a reload.
  await andSettle(page, () => list.getByRole("button", { name: `Delete ${name}` }).click());
  await expect(page.getByText(`Removed "${name}"`)).toBeVisible();
  await expect(page.getByText("Your shopping list is empty.")).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(untick(name)).toBeVisible();
  await openHealth(page, "Shopping");
  await expect(untick(name)).toBeVisible();

  // Delete it for good: the database lost it.
  await andSettle(page, () => list.getByRole("button", { name: `Delete ${name}` }).click());
  await expect(page.getByText("Your shopping list is empty.")).toBeVisible();
  await openHealth(page, "Shopping");
  await expect(page.getByText("Your shopping list is empty.")).toBeVisible();
});

// A shopping row, by its item's name; a toast's Undo, by the toast's message.
const shoppingRow = (page: Page, name: string) =>
  page.locator(".shopping-row").filter({ has: page.getByRole("button", { name: `Edit ${name}`, exact: true }) });
const undoIn = (page: Page, message: string) => page.locator(".toast-item").filter({ hasText: message }).getByRole("button", { name: "Undo" });

// A double tap acts once (D-043): the second tap lands on the row that took the first one's place, and the guard swallows it.
test("a double tap on a shopping item's Delete or its box acts once [HSHOP-01, HSHOP-02]", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");
  // Untouched rows show by name, so these three show in this order.
  const base = itemName();
  const [first, second, third] = [`${base} a`, `${base} b`, `${base} c`];
  for (const n of [first, second, third]) await addItem(page, n, 1);
  const list = page.getByRole("region", { name: "Shopping list" });
  const remove = (n: string) => list.getByRole("button", { name: `Delete ${n}`, exact: true });
  const tick = (n: string) => list.getByRole("button", { name: `Mark ${n} as bought`, exact: true });
  await page.evaluate(() => window.scrollTo(0, 0));

  // Delete: the second row slides up, so its Delete is under the second tap.
  await page.keyboard.press("Shift");
  const removeAt = center(await remove(first).boundingBox());
  expect(await burst(page, removeAt)).toBe(1);
  await expect(page.getByText(`Removed "${first}"`)).toBeVisible();
  await expect(remove(second)).toBeVisible();
  expect(Math.abs(center(await remove(second).boundingBox()).y - removeAt.y)).toBeLessThan(10);

  // Box: a bought row goes last, so the third row's box slides up under the second tap.
  await page.keyboard.press("Shift");
  const tickAt = center(await tick(second).boundingBox());
  expect(await burst(page, tickAt)).toBe(1);
  await expect(page.getByText(`Bought "${second}"`)).toBeVisible();
  await expect(tick(third)).toBeVisible();
  expect(Math.abs(center(await tick(third).boundingBox()).y - tickAt.y)).toBeLessThan(10);

  // The database has the same.
  await openHealth(page, "Shopping");
  await expect(remove(first)).toHaveCount(0);
  await expect(list.getByRole("button", { name: `Mark ${second} as not bought`, exact: true })).toBeVisible();
  await expect(tick(third)).toBeVisible();
});

test("Undo of a tick puts the item back in its place, also after a reload [HSHOP-06]", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");
  // Untouched rows show by name, so these two show in this order.
  const base = itemName();
  const [first, second] = [`${base} a`, `${base} b`];
  for (const n of [first, second]) await addItem(page, n, 1);
  const rows = page.getByRole("region", { name: "Shopping list" }).locator(".shopping-row");
  await expect(rows).toHaveText([new RegExp(first), new RegExp(second)]);

  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: `Mark ${first} as bought`, exact: true }).click());
  await expect(rows).toHaveText([new RegExp(second), new RegExp(first)]);
  await andSettle(page, () => undoIn(page, `Bought "${first}"`).click());
  await expect(rows).toHaveText([new RegExp(first), new RegExp(second)]);
  await openHealth(page, "Shopping");
  await expect(rows).toHaveText([new RegExp(first), new RegExp(second)]);
});

// An add of a name and unit already on the list adds the amount to that row, which takes the new category (D-042).
test("adding an item already on the list adds the amounts in the new category, with Undo and a clear cap [HSHOP-12, HSHOP-10]", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");
  const name = itemName();
  await addItem(page, name, 1);
  const row = shoppingRow(page, name);
  const group = page.locator(".shopping-group").filter({ has: page.getByRole("button", { name: `Edit ${name}`, exact: true }) });
  await expect(group).toContainText("Other");

  // Half a piece more, filed under Produce: one row of 1,5 pcs (the app's number format) in Produce.
  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New shopping item" });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Amount").fill("0,5");
  await form.getByRole("combobox", { name: "Category" }).selectOption("produce");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form).toBeHidden();
  await expect(page.getByText("Merged with existing item", { exact: true })).toBeVisible();
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("1,5 pcs");
  await expect(group).toContainText("Produce");

  // Undo puts the old amount and category back, also after a reload.
  await andSettle(page, () => undoIn(page, "Merged with existing item").click());
  await expect(row).toContainText("1 pcs");
  await expect(group).toContainText("Other");
  await openHealth(page, "Shopping");
  await expect(row).toContainText("1 pcs");
  await expect(group).toContainText("Other");

  // An add that would go over 1.000 says so in the form, which keeps what was typed.
  await page.getByRole("button", { name: "Add item" }).click();
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Amount").fill("1000");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form.getByText(`"${name}" would be 1.001 pcs; the most is 1.000.`, { exact: true })).toBeVisible();
  await expect(form.getByLabel("Amount")).toHaveValue("1.000");
});

test("a name that is too long or an amount that is not a number stays typed and says why [HSHOP-13, HSHOP-11]", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");
  const long = "x".repeat(121);
  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New shopping item" });
  await form.getByLabel("Name").fill(long);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form.getByText("Too long (max 120)", { exact: true })).toBeVisible();
  await expect(form.getByLabel("Name")).toHaveValue(long);

  // Text in the amount stays as typed, with its error under the field, and nothing is added.
  await form.getByLabel("Name").fill(itemName());
  await form.getByLabel("Amount").fill("abc");
  await expect(form.getByText("Must be a number", { exact: true })).toBeVisible();
  await expect(form.getByLabel("Amount")).toHaveValue("abc");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toBeVisible();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Your shopping list is empty.")).toBeVisible();

  // A unit name too long for the Units card.
  const unit = "u".repeat(31);
  await page.getByRole("button", { name: "Add unit" }).click();
  const unitForm = page.getByRole("dialog", { name: "New unit" });
  await unitForm.getByLabel("Name").fill(unit);
  await andSettle(page, () => unitForm.getByRole("button", { name: "Save" }).click());
  await expect(unitForm.getByText("Too long (max 30)", { exact: true })).toBeVisible();
  await expect(unitForm.getByLabel("Name")).toHaveValue(unit);
});

// Another device deleted the item while this one's edit form was open: Save closes the form, says so and drops the row.
test("saving an edit of an item deleted meanwhile closes the form and drops the row [HSHOP-16]", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");
  const name = itemName();
  await addItem(page, name, 2);
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  const form = page.getByRole("dialog", { name: "Edit shopping item" });
  await form.getByLabel("Amount").fill("3");
  const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
  try {
    expect((await admin.query("DELETE FROM shopping_items WHERE name = $1", [name])).rowCount).toBe(1);
  } finally {
    await admin.end();
  }
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form).toBeHidden();
  await expect(page.getByText("This item is no longer on the list.", { exact: true })).toBeVisible();
  await expect(shoppingRow(page, name)).toHaveCount(0);
});

// A category delete's toast touches the items it moved (D-040): editing one of them takes that toast's Undo, which would
// otherwise move the edited item back.
test("editing an item that a category delete moved takes the delete's Undo [TOUCHES]", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");
  const name = itemName();
  await addItem(page, name, 2, "meat");
  await page.keyboard.press("Shift");
  const removed = 'Removed "meat"; its items are in Other';
  await andSettle(page, () => page.getByRole("button", { name: "Delete category meat", exact: true }).click());
  await expect(undoIn(page, removed)).toBeVisible();

  await page.keyboard.press("Shift");
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  const form = page.getByRole("dialog", { name: "Edit shopping item" });
  await form.getByLabel("Amount").fill("3");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(page.getByText(`Saved "${name}"`, { exact: true })).toBeVisible();
  // Counted at once, while the toast is still on screen (see the meal [TOUCHES] test below).
  expect(await undoIn(page, removed).count()).toBe(0);
  await expect(page.locator(".toast-item").filter({ hasText: removed })).toBeVisible();
});

// The first write that carries `marker` reaches the server, which writes, but its answer is lost on the way back (the
// page sees a network error). Answers what that write sent.
async function loseAnswerOnce(page: Page, marker: string) {
  let sent = "";
  await page.route(
    (url) => url.pathname === "/health",
    async (route) => {
      const request = route.request();
      const body = request.postData() ?? "";
      if (sent || request.method() !== "POST" || !("next-action" in request.headers()) || !body.includes(marker)) return route.fallback();
      sent = body;
      await route.fetch();
      await route.abort();
    },
  );
  return () => sent;
}

async function sql<T>(query: string, values: unknown[]) {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
  try {
    return (await admin.query(query, values)).rows as T[];
  } finally {
    await admin.end();
  }
}

// The add form makes its id when it opens and keeps it, so Save again after a lost answer sends the same add, which the
// server answers with the row the first one made (D-040), also when that add merged into a row already on the list.
test("Save again after a lost answer adds the item once, also when the add merged [D-040]", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");
  const name = itemName();
  await addItem(page, name, 1);
  await dismissToast(page, `Added "${name}"`);
  await loseAnswerOnce(page, `"name":"${name}"`);

  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New shopping item" });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Amount").fill("1");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Couldn't confirm the change. Reloaded.")).toBeVisible();
  await expect(form).toBeVisible();

  // Shift ends the tap burst (D-043): this Save is a second one, on purpose.
  await page.keyboard.press("Shift");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"name":"${name}"`);
  await expect(form).toBeHidden();
  // The repeat says so, and has no Undo (whether the first add merged is no longer known).
  await expect(page.getByText(`Already added "${name}"`, { exact: true })).toBeVisible();
  expect(await undoIn(page, `Already added "${name}"`).count()).toBe(0);
  await expect(shoppingRow(page, name)).toHaveCount(1);
  await expect(shoppingRow(page, name)).toContainText("2 pcs");
  expect(await sql("SELECT amount FROM shopping_items WHERE name = $1 AND cleared_at IS NULL", [name])).toEqual([{ amount: "2.00" }]);
});

test("Save again after a lost answer logs the meal once [D-040]", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");
  // A number no other meal test uses, to find this meal's write.
  const kcal = 500 + Math.floor(Math.random() * 400);
  const sent = await loseAnswerOnce(page, `"calories":${kcal}`);

  await page.getByRole("button", { name: "Add meal" }).click();
  const form = page.getByRole("dialog", { name: "New meal" });
  await form.getByLabel("Calories (kcal)").fill(String(kcal));
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Couldn't confirm the change. Reloaded.")).toBeVisible();
  await expect(form).toBeVisible();

  await page.keyboard.press("Shift");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"calories":${kcal}`);
  await expect(form).toBeHidden();
  await expect(page.getByText("Already saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: deleteMeal(String(kcal)) })).toHaveCount(1);
  const id = /"id":"([0-9a-f-]{36})"/.exec(sent())?.[1];
  expect(id).toBeTruthy();
  const rows = await sql<{ count: string }>(
    "SELECT count(*) FROM meals WHERE calories = $2 AND user_id = (SELECT user_id FROM meals WHERE id = $1)",
    [id, kcal],
  );
  expect(rows).toEqual([{ count: "1" }]);
});

const weightCard = (page: Page) => page.getByRole("region", { name: "Weight", exact: true });

/** The signed-in user's id, for the SQL that checks or seeds their rows. */
async function userId(page: Page) {
  const { user } = await (await page.request.get("/api/auth/session")).json();
  return user.id as string;
}

// Opens the weight form and saves `kilograms`; that answer is lost (the page reloads, the form stays), and Save again.
async function saveWeightTwice(page: Page, kilograms: string) {
  const form = page.getByRole("dialog", { name: "Edit weight" });
  await loseAnswerOnce(page, `"kilograms":${kilograms}`);
  await weightCard(page).getByRole("button", { name: "Edit today's weight" }).click();
  await form.getByLabel("Weight today (kg)").fill(kilograms);
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Couldn't confirm the change. Reloaded.")).toBeVisible();
  await expect(form).toBeVisible();
  await page.keyboard.press("Shift");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"kilograms":${kilograms}`);
  await expect(form).toBeHidden();
}

// The weight form makes its id when it opens (D-040), so Save again after a lost answer finds the day's row the first
// save made: one row, and a toast that says it was already saved, without an Undo.
test("Save again after a lost answer adds the weigh-in once [D-040]", async ({ signedInPage: page }) => {
  const user = await userId(page);
  await openHealth(page, "Today");
  await saveWeightTwice(page, "77");
  await expect(page.getByText("Already saved", { exact: true })).toBeVisible();
  expect(await undoIn(page, "Already saved").count()).toBe(0);
  expect(await sql("SELECT kilograms FROM weight_entries WHERE user_id = $1", [user])).toEqual([{ kilograms: "77.00" }]);
});

// After a lost answer the day already holds the new value, so the second save's `previous` is that value: the Undo
// writes back what the form showed when it opened instead.
test("Undo of a weight edit saved again after a lost answer puts back the value the form opened with [D-040]", async ({ signedInPage: page }) => {
  const user = await userId(page);
  await sql("INSERT INTO weight_entries (user_id, date, kilograms) VALUES ($1, (now() AT TIME ZONE 'Europe/Bucharest')::date, 80)", [user]);
  await openHealth(page, "Today");
  await saveWeightTwice(page, "81");
  await expect(undoIn(page, "Weight set to")).toBeVisible();
  expect(await sql("SELECT kilograms FROM weight_entries WHERE user_id = $1", [user])).toEqual([{ kilograms: "81.00" }]);
  await andSettle(page, () => undoIn(page, "Weight set to").click());
  expect(await sql("SELECT kilograms FROM weight_entries WHERE user_id = $1", [user])).toEqual([{ kilograms: "80.00" }]);
});

// The Undo of a weight edit carries the value the edit saved (D-040): when another device changed the day since, the
// Undo is refused with the reason and the other device's value stays.
test("Undo of a weight edit another device changed since is refused and keeps the newer value [D-040]", async ({ signedInPage: page, browser }) => {
  const user = await userId(page);
  await sql("INSERT INTO weight_entries (user_id, date, kilograms) VALUES ($1, (now() AT TIME ZONE 'Europe/Bucharest')::date, 80)", [user]);
  const saveWeight = async (p: Page, kilograms: string) => {
    await weightCard(p).getByRole("button", { name: "Edit today's weight" }).click();
    const form = p.getByRole("dialog", { name: "Edit weight" });
    await form.getByLabel("Weight today (kg)").fill(kilograms);
    await andSettle(p, () => form.getByRole("button", { name: "Save" }).click());
    await expect(form).toBeHidden();
  };
  const device = await browser.newContext();
  try {
    await device.addCookies(await page.context().cookies());
    const other = await device.newPage();
    await openHealth(page, "Today");
    await openHealth(other, "Today");
    await saveWeight(page, "81");
    const undo = undoIn(page, "Weight set to");
    await undo.hover(); // the toast stays while the mouse is on it
    await saveWeight(other, "85");
    expect(await sql("SELECT kilograms FROM weight_entries WHERE user_id = $1", [user])).toEqual([{ kilograms: "85.00" }]);
    await andSettle(page, () => undo.click());
    await expect(page.getByText("This changed on another device. Check the new value and try again.")).toBeVisible();
    expect(await sql("SELECT kilograms FROM weight_entries WHERE user_id = $1", [user])).toEqual([{ kilograms: "85.00" }]);
  } finally {
    await device.close();
  }
});

// The merge's Undo puts the old row back; when the merged item was deleted meanwhile, the server's refusal says why.
test("Undo of a merge onto an item deleted meanwhile says the item is gone [D-040]", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");
  const name = itemName();
  await addItem(page, name, 1);
  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New shopping item" });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Amount").fill("1");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(undoIn(page, "Merged with existing item")).toBeVisible();

  expect(await sql("DELETE FROM shopping_items WHERE name = $1 RETURNING id", [name])).toHaveLength(1);
  await andSettle(page, () => undoIn(page, "Merged with existing item").click());
  await expect(page.getByText("This item is no longer on the list.", { exact: true })).toBeVisible();
  await expect(shoppingRow(page, name)).toHaveCount(0);
});

// An Undo the server refuses says why (D-040): the Undo of an edit on an item deleted meanwhile names the reason.
test("Undo of a shopping edit on an item deleted meanwhile says the item is gone [D-040]", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");
  const name = itemName();
  await addItem(page, name, 2);
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  const form = page.getByRole("dialog", { name: "Edit shopping item" });
  await form.getByLabel("Amount").fill("3");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(undoIn(page, `Saved "${name}"`)).toBeVisible();

  expect(await sql("DELETE FROM shopping_items WHERE name = $1 RETURNING id", [name])).toHaveLength(1);
  await andSettle(page, () => undoIn(page, `Saved "${name}"`).click());
  await expect(page.getByText("This item is no longer on the list.", { exact: true })).toBeVisible();
  await expect(page.getByText("Failed to undo the edit")).toHaveCount(0);
});

const SIGNED_OUT = "You're signed out. Sign in again.";

// Signs the page out once its own refreshes are done, and holds every refresh after that: the app refreshes 600 ms after
// any answer, and a signed-out refresh goes to the sign-in form, so holding it keeps on screen what the refusal left.
async function signOutHere(page: Page) {
  await refreshesDone(page);
  await page.route((url) => url.pathname === "/health", (route) => (isRefresh(page, route.request()) ? undefined : route.fallback()));
  await page.context().clearCookies();
}

// A refused write shows the server's reason (D-040), not a fixed failure text, and changes nothing.
test("Clear bought when signed out says so and clears nothing [D-040]", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");
  const name = itemName();
  await addItem(page, name, 1);
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: `Mark ${name} as bought`, exact: true }).click());
  await signOutHere(page);
  await andSettle(page, () => page.getByRole("button", { name: "Clear bought" }).click());
  await expect(page.getByText(SIGNED_OUT, { exact: true })).toBeVisible();
  await expect(page.getByText("Failed to clear bought items")).toHaveCount(0);
  await expect(shoppingRow(page, name)).toBeVisible();
  expect(await sql("SELECT is_bought, cleared_at FROM shopping_items WHERE name = $1", [name])).toEqual([{ is_bought: true, cleared_at: null }]);
});

// Only "already deleted" counts as a weight delete done: any other refusal puts the weigh-in back with the reason.
test("a weight delete refused when signed out keeps the weigh-in on screen and says why [D-040]", async ({ signedInPage: page }) => {
  const user = await userId(page);
  await sql("INSERT INTO weight_entries (user_id, date, kilograms) VALUES ($1, (now() AT TIME ZONE 'Europe/Bucharest')::date, 80)", [user]);
  await openHealth(page, "Today");
  await expect(weightCard(page)).toContainText("7-day average · 80 kg");
  await signOutHere(page);
  await andSettle(page, () => weightCard(page).getByRole("button", { name: "Delete today's weight" }).click());
  await expect(page.getByText(SIGNED_OUT, { exact: true })).toBeVisible();
  await expect(weightCard(page)).toContainText("7-day average · 80 kg");
  await expect(page.getByText("Removed 80 kg")).toHaveCount(0); // the toast goes with its Undo
  expect(await sql("SELECT kilograms FROM weight_entries WHERE user_id = $1", [user])).toEqual([{ kilograms: "80.00" }]);
});

test("Undo of a weigh-in add refused when signed out keeps the weigh-in on screen and says why [D-040]", async ({ signedInPage: page }) => {
  const user = await userId(page);
  await openHealth(page, "Today");
  await weightCard(page).getByRole("button", { name: "Edit today's weight" }).click();
  const form = page.getByRole("dialog", { name: "Edit weight" });
  await form.getByLabel("Weight today (kg)").fill("77");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  const undo = undoIn(page, "Added 77 kg");
  await undo.hover(); // the toast stays while the mouse is on it
  await signOutHere(page);
  await andSettle(page, () => undo.click());
  await expect(page.getByText(SIGNED_OUT, { exact: true })).toBeVisible();
  await expect(weightCard(page)).toContainText("7-day average · 77 kg");
  expect(await sql("SELECT kilograms FROM weight_entries WHERE user_id = $1", [user])).toEqual([{ kilograms: "77.00" }]);
});

// A merging add takes the add's id, so the row it replaced is gone (D-042). This adds `name` on the page, then the same
// item in another browser, which merges into it: the page, which hears nothing of that write, still shows the old row.
async function mergeAwayElsewhere(page: Page, browser: Browser, name: string) {
  await addItem(page, name, 1);
  await refreshesDone(page); // a refresh that lands after the merge would show the merged row, and the page would not be stale
  const context = await browser.newContext();
  try {
    await context.addCookies(await page.context().cookies());
    const other = await context.newPage();
    await openHealth(other, "Shopping");
    await other.getByRole("button", { name: "Add item" }).click();
    const form = other.getByRole("dialog", { name: "New shopping item" });
    await form.getByLabel("Name").fill(name);
    await andSettle(other, () => form.getByRole("button", { name: "Save" }).click());
    await expect(other.getByText("Merged with existing item")).toBeVisible();
  } finally {
    await context.close();
  }
}

// What the stale page does to the row the other browser merged away. Each runs in its own test: a refusal refreshes
// the page, which would show the merged row to the next one.
const STALE_WRITES: Record<string, (page: Page, name: string) => Promise<void>> = {
  "a tick": (page, name) => andSettle(page, () => page.getByRole("button", { name: `Mark ${name} as bought`, exact: true }).click()),
  "a delete": (page, name) => andSettle(page, () => page.getByRole("button", { name: `Delete ${name}`, exact: true }).click()),
  "an edit's Save": async (page, name) => {
    await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
    const form = page.getByRole("dialog", { name: "Edit shopping item" });
    await form.getByLabel("Amount").fill("3");
    await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
    await expect(form).toBeHidden();
  },
};

// The page gets the server's reason, never another refusal (the edit names an item now on the list, yet the item's
// absence is what it hears), and the database keeps the merged row as it was.
for (const [write, act] of Object.entries(STALE_WRITES)) {
  test(`${write} on a row another browser merged away says the item is no longer on the list [HSHOP-16]`, async ({ signedInPage: page, browser }) => {
    await openHealth(page, "Shopping");
    const name = itemName();
    await mergeAwayElsewhere(page, browser, name);
    await page.keyboard.press("Shift");
    await act(page, name);
    await expect(page.getByText("This item is no longer on the list.", { exact: true })).toBeVisible();
    await expect(page.getByText(`"${name}" is already on the list with this unit.`)).toHaveCount(0);
    expect(await sql("SELECT amount, is_bought FROM shopping_items WHERE name = $1 AND cleared_at IS NULL", [name])).toEqual([
      { amount: "2.00", is_bought: false },
    ]);
  });
}

// Clear bought deletes for good what was taken off the list before it, so an older delete's toast loses its Undo.
test("Clear bought takes the Undo of an older delete's toast [TOUCHES]", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");
  const base = itemName();
  const [gone, bought] = [`${base} a`, `${base} b`];
  for (const n of [gone, bought]) await addItem(page, n, 1);
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: `Delete ${gone}`, exact: true }).click());
  await expect(undoIn(page, `Removed "${gone}"`)).toBeVisible();
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: `Mark ${bought} as bought`, exact: true }).click());
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: "Clear bought" }).click());
  await expect(page.getByText("Cleared 1 bought item")).toBeVisible();
  // Counted at once, while the toast is still on screen (see the meal [TOUCHES] test below).
  expect(await undoIn(page, `Removed "${gone}"`).count()).toBe(0);
  await expect(page.locator(".toast-item").filter({ hasText: `Removed "${gone}"` })).toBeVisible();
});

// Two clicks in one task reach the handler before the page re-renders, so only the guard (D-043) stops the second clear.
test("two clicks on Clear bought in one task clear once [D-043]", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");
  const name = itemName();
  await addItem(page, name, 1);
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: `Mark ${name} as bought`, exact: true }).click());
  await settled(page);
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && "next-action" in r.headers() && (r.postData() ?? "").includes('"itemIds"')) writes++;
  });
  await andSettle(page, () =>
    page.getByRole("button", { name: "Clear bought" }).evaluate((b: HTMLElement) => {
      b.click();
      b.click();
    }),
  );
  await settled(page);
  expect(writes).toBe(1);
  await expect(page.locator(".toast-item").filter({ hasText: "Cleared 1 bought item" })).toHaveCount(1);
});

// A unit shows as stored ("pcs"), also in the toast of a unit delete [HSHOP-14].
test("deleting a unit says its items are in pcs, in lower case [HSHOP-14]", async ({ signedInPage: page }) => {
  await openHealth(page, "Shopping");
  const name = itemName();
  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New shopping item" });
  await form.getByLabel("Name").fill(name);
  await form.getByRole("combobox", { name: "Unit" }).selectOption("jar");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(shoppingRow(page, name)).toContainText("1 jar");
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: "Delete unit jar", exact: true }).click());
  await expect(page.getByText('Removed "jar"; its items are in pcs', { exact: true })).toBeVisible();
  await expect(shoppingRow(page, name)).toContainText("1 pcs");
});

test("a signed-out visit to /health goes to the sign-in form, which comes back to /health [PATH]", async ({ page }) => {
  const name = `e2e-${randomUUID().slice(0, 8)}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
  try {
    await page.goto("/health", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/signin\?next=%2Fhealth$/);
    await page.getByLabel("Username").fill(name);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/health$/);
    await expect(page.getByRole("button", { name: "Add meal" })).toBeVisible();
  } finally {
    try {
      await admin.query("DELETE FROM users WHERE issuer = 'dev' AND subject = $1", [name]);
    } finally {
      await admin.end();
    }
  }
});

test("the meal form keeps Save off until a value survives rounding, says calories can't be negative when a macro is beside them, and reads the app's number format [HTODAY-06, HTODAY-04, HTODAY-05, HTODAY-13]", async ({
  signedInPage: page,
}) => {
  await openHealth(page, "Today");
  await page.getByRole("button", { name: "Add meal" }).click();
  const form = page.getByRole("dialog", { name: "New meal" });
  const save = form.getByRole("button", { name: "Save" });
  const field = (label: string) => form.getByLabel(label);
  await expect(save).toBeDisabled();

  // Protein is kept to one decimal: 0,04 rounds to nothing, 0,05 to 0,1.
  await field("Protein (g)").fill("0,04");
  await expect(save).toBeDisabled();
  await field("Protein (g)").fill("0,05");
  await expect(save).toBeEnabled();

  // A negative number is no value either; with a macro beside it, the form refuses it in the server's words.
  await field("Protein (g)").fill("");
  await field("Calories (kcal)").fill("-100");
  await expect(save).toBeDisabled();
  await field("Protein (g)").fill("30");
  await save.click();
  await expect(form.getByText(MEAL_CALORIES_NEGATIVE, { exact: true })).toBeVisible();
  await expect(page.getByText("Failed to add meal")).toHaveCount(0);

  // Thousands with a dot, decimals with a comma, in the fields and on the screen.
  await field("Calories (kcal)").fill("1.500");
  await field("Protein (g)").fill("30,5");
  await andSettle(page, () => save.click());
  await expect(form).toBeHidden();
  await expect(page.getByText("Added meal (1.500 kcal)")).toBeVisible();
  await expect(page.getByText("1.500 kcal · P 30,5", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Nutrition" })).toContainText(/Calories\s*1\.500\s*\/ 3\.350 kcal/);
  await expect(page.getByRole("button", { name: deleteMeal("1.500") })).toBeVisible();
});

// Each Undo toast names the rows it touches (D-040): a newer toast about the same meal takes the older toast's Undo away,
// so that Undo never writes over the newer change; a toast about another row keeps its Undo.
test("a newer toast about the same meal takes the older toast's Undo; the water toast keeps its own [TOUCHES]", async ({ signedInPage: page }) => {
  const toast = (message: string) => page.locator(".toast-item").filter({ hasText: message });
  await openHealth(page, "Today");
  await addMeal(page);
  await expect(undoIn(page, "Added meal (450 kcal)")).toBeVisible();
  // Shift ends the last tap burst (D-043); this test is about the toasts, not the guard.
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("region", { name: "Water" }).getByRole("button", { name: "+250 ml" }).click());
  await expect(undoIn(page, "Added 250 ml")).toBeVisible();
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: deleteMeal("450") }).click());
  await expect(undoIn(page, 'Removed "Meal"')).toBeVisible();
  // Counted at once, not with a retrying assertion, which an expiring toast would also satisfy; the toast is still
  // there afterwards, so its Undo is gone from a toast on screen.
  expect(await undoIn(page, "Added meal (450 kcal)").count()).toBe(0);
  await expect(toast("Added meal (450 kcal)")).toBeVisible();
  await expect(undoIn(page, "Added 250 ml")).toBeVisible();
});

test("a double tap on the meal Save or on a water add writes once [D-043]", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");
  await addMeal(page);
  await dismissToast(page, "Added meal (450 kcal)");

  // The first meal's Delete is lined up under Save of the next meal's form, so a second tap that got through would
  // delete it. The page cannot scroll while the form is open, so it is lined up first, and the form then opens without
  // a scroll (a dispatched click).
  const openForm = page.getByRole("button", { name: "Add meal" });
  const form = page.getByRole("dialog", { name: "New meal" });
  await openForm.click();
  const saveBox = await form.getByRole("button", { name: "Save" }).boundingBox();
  const save = center(saveBox);
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();
  const under = page.getByRole("button", { name: deleteMeal("450") });
  await page.evaluate((dy) => window.scrollBy(0, dy), center(await under.boundingBox()).y - save.y);
  const spot = { x: center(await under.boundingBox()).x, y: save.y };
  expect(Math.abs(center(await under.boundingBox()).y - spot.y)).toBeLessThan(10);
  expect(spot.x).toBeGreaterThan(saveBox!.x);
  expect(spot.x).toBeLessThan(saveBox!.x + saveBox!.width);

  await openForm.dispatchEvent("click");
  await form.getByLabel("Calories (kcal)").fill("300");
  expect(await burst(page, spot)).toBe(1);
  await expect(page.getByText("Added meal (300 kcal)")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Both meals are there, and their Delete buttons say which is which (HTODAY-12).
  await expect(under).toHaveCount(1);
  await expect(page.getByRole("button", { name: deleteMeal("300") })).toHaveCount(1);

  // A double tap on a water add adds once.
  await page.keyboard.press("Shift");
  const water = page.getByRole("region", { name: "Water" });
  const add = water.getByRole("button", { name: "+250 ml" });
  await add.scrollIntoViewIfNeeded();
  expect(await burst(page, center(await add.boundingBox()))).toBe(1);
  await expect(water).toContainText("250 / 3.000 ml");
  await openHealth(page, "Today");
  await expect(water).toContainText("250 / 3.000 ml");
});

// The water and goals forms send each value with the one they opened with (D-040). Opened again before their last save
// has answered, they still show the value from before it, so a Save then would be refused as changed on another device:
// Save waits for that answer, which closes the form, and the next opening starts from the saved value.
test("a water or goals form opened again while its last save is unanswered holds Save until the answer [D-043]", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");
  const forms = [
    { region: "Water", edit: "Edit water and goal", dialog: "Edit water", field: "Water today (ml)", first: "1000", saved: "1.000", toast: "Water set to 1.000 ml", next: "1500", shown: "1.500 / 3.000 ml" },
    { region: "Nutrition", edit: "Edit goals", dialog: "Edit goals", field: "Calories (kcal)", first: "2800", saved: "2.800", toast: "Saved nutrition goals", next: "2900", shown: "/ 2.900 kcal" },
  ];
  for (const { region: regionName, edit, dialog, field, first, saved, toast, next, shown } of forms) {
    const region = page.getByRole("region", { name: regionName });
    const form = page.getByRole("dialog", { name: dialog });
    const marker = `"to":${first}`;
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/health", async (route) => {
      if (route.request().method() === "POST" && (route.request().postData() ?? "").includes(marker)) await held;
      await route.fallback();
    });
    await region.getByRole("button", { name: edit }).click();
    await form.getByLabel(field).fill(first);
    const firstAnswered = page.waitForResponse((r) => (r.request().postData() ?? "").includes(marker));
    await form.getByRole("button", { name: "Save" }).click();
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(form).toBeHidden();
    await region.getByRole("button", { name: edit }).click();
    await expect(form.getByRole("button", { name: "Saving..." })).toBeDisabled();
    await expect(form.getByLabel(field)).toBeDisabled();
    release();
    await firstAnswered;
    await page.unroute("**/health");
    await expect(form).toBeHidden();
    await expect(page.getByText(toast)).toBeVisible();
    await page.getByRole("button", { name: "Dismiss notification" }).click();

    await region.getByRole("button", { name: edit }).click();
    await expect(form.getByLabel(field)).toHaveValue(saved);
    await form.getByLabel(field).fill(next);
    await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
    await expect(form).toBeHidden();
    await expect(region).toContainText(shown);
    await expect(page.getByText("This changed on another device")).toHaveCount(0);
    await page.getByRole("button", { name: "Dismiss notification" }).click();
  }
  await openHealth(page, "Today");
  await expect(page.getByRole("region", { name: "Water" })).toContainText("1.500 / 3.000 ml");
  await expect(page.getByRole("region", { name: "Nutrition" })).toContainText("/ 2.900 kcal");
});

test("a meal deleted in one tab leaves another tab after its refresh, without a reload [SERVER-STATE]", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");
  await addMeal(page);
  const other = await page.context().newPage();
  try {
    await openHealth(other, "Today");
    await expect(other.getByText(MEAL_NUMBERS, { exact: true })).toBeVisible();
    // A mark on the window: a reload would drop it.
    await other.evaluate(() => Object.assign(window, { kept: true }));
    await page.keyboard.press("Shift");
    await andSettle(page, () => page.getByRole("button", { name: deleteMeal("450") }).click());
    await expect(other.getByText("No meals logged today.")).toBeVisible();
    expect(await other.evaluate(() => (window as Window & { kept?: boolean }).kept)).toBe(true);
  } finally {
    await other.close();
  }
});

test("the open tab is kept on this device after a reload, and not on another device [HTODAY-17]", async ({ signedInPage: page, browser }) => {
  await openHealth(page, "Shopping");
  await page.reload();
  await expect(page.getByRole("tab", { name: TABS.Shopping })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
  await expect(page).toHaveURL(/\/health$/);

  // Another browser with the same session opens on Today.
  const context = await browser.newContext();
  try {
    await context.addCookies(await page.context().cookies());
    const other = await context.newPage();
    await other.goto("/health");
    await expect(other.getByRole("button", { name: "Add meal" })).toBeVisible();
    await expect(other.getByRole("tab", { name: TABS.Today })).toHaveAttribute("aria-selected", "true");
  } finally {
    await context.close();
  }
});

// An edit sends only the fields it changed (D-040): a form opened before another tab's save does not write that save
// back with the old values it still shows, so both changes stay.
test("two tabs editing different goals, or steps and its goal, both keep their change [HTODAY-07]", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");
  const other = await page.context().newPage();
  try {
    await openHealth(other, "Today");

    // This tab opens its goals form; the other tab then saves new calories, which this tab's refresh brings in.
    await page.getByRole("button", { name: "Edit goals" }).click();
    const form = page.getByRole("dialog", { name: "Edit goals" });
    await expect(form.getByLabel("Calories (kcal)")).toHaveValue("3.350");
    await other.getByRole("button", { name: "Edit goals" }).click();
    const otherForm = other.getByRole("dialog", { name: "Edit goals" });
    await otherForm.getByLabel("Calories (kcal)").fill("2800");
    await andSettle(other, () => otherForm.getByRole("button", { name: "Save" }).click());
    await expect(other.getByText("Saved nutrition goals")).toBeVisible();
    await expect(page.getByText("/ 2.800 kcal", { exact: true })).toBeAttached();
    // This tab changes the protein only.
    await form.getByLabel("Protein (g)").fill("150");
    await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
    await expect(page.getByText("Saved nutrition goals")).toBeVisible();

    // The same with steps: this tab's form is open while the other tab sets the goal; this tab sets the amount.
    const steps = (p: Page) => p.getByRole("region", { name: "Steps" });
    await steps(page).getByRole("button", { name: "Edit steps and goal" }).click();
    const stepsForm = page.getByRole("dialog", { name: "Edit steps" });
    await expect(stepsForm.getByLabel("Daily goal (steps)")).toHaveValue("10.000");
    await steps(other).getByRole("button", { name: "Edit steps and goal" }).click();
    const otherSteps = other.getByRole("dialog", { name: "Edit steps" });
    await otherSteps.getByLabel("Daily goal (steps)").fill("12000");
    await andSettle(other, () => otherSteps.getByRole("button", { name: "Save" }).click());
    await expect(other.getByText("Steps goal set to 12.000")).toBeVisible();
    await expect(page.getByText("/ 12.000", { exact: true })).toBeAttached();
    await stepsForm.getByLabel("Steps today").fill("8000");
    await andSettle(page, () => stepsForm.getByRole("button", { name: "Save" }).click());
    await expect(page.getByText("Steps set to 8.000", { exact: true })).toBeVisible();

    // The database kept both changes of each pair.
    await openHealth(page, "Today");
    const nutrition = page.getByRole("region", { name: "Nutrition" });
    await expect(nutrition.getByText("/ 2.800 kcal", { exact: true })).toBeVisible();
    await expect(nutrition.getByText("/ 150g", { exact: true })).toBeVisible();
    await expect(steps(page)).toContainText("8.000 / 12.000");
  } finally {
    await other.close();
  }
});

// A change carries the value its screen showed (D-040): another device that still shows the old value is refused, sees
// why and then the current value, and the database keeps the first device's change.
test("a stale device's water tap, steps or goal save is refused and then shows the current value [D-040]", async ({ signedInPage: page, browser }) => {
  const CHANGED = "This changed on another device. Check the new value and try again.";
  const device = await browser.newContext();
  try {
    await device.addCookies(await page.context().cookies());
    const other = await device.newPage();
    await openHealth(page, "Today");
    await openHealth(other, "Today");
    const water = (p: Page) => p.getByRole("region", { name: "Water" });
    const steps = (p: Page) => p.getByRole("region", { name: "Steps" });

    // Water: this device adds 250 ml; the other one, still showing 0, adds too.
    await expect(water(other)).toContainText("0 / 3.000 ml");
    await andSettle(page, () => water(page).getByRole("button", { name: "+250 ml" }).click());
    await expect(water(page)).toContainText("250 / 3.000 ml");
    await expect(water(other)).toContainText("0 / 3.000 ml");
    await andSettle(other, () => water(other).getByRole("button", { name: "+250 ml" }).click());
    await expect(other.getByText(CHANGED)).toBeVisible();
    await expect(water(other)).toContainText("250 / 3.000 ml");
    await dismissToast(other, CHANGED);

    // Steps: the other device's form is open while this one saves 8.000; its own save from 0 is refused.
    await steps(other).getByRole("button", { name: "Edit steps and goal" }).click();
    const otherSteps = other.getByRole("dialog", { name: "Edit steps" });
    await expect(otherSteps.getByLabel("Steps today")).toHaveValue("0");
    await steps(page).getByRole("button", { name: "Edit steps and goal" }).click();
    const stepsForm = page.getByRole("dialog", { name: "Edit steps" });
    await stepsForm.getByLabel("Steps today").fill("8000");
    await andSettle(page, () => stepsForm.getByRole("button", { name: "Save" }).click());
    await expect(page.getByText("Steps set to 8.000", { exact: true })).toBeVisible();
    await otherSteps.getByLabel("Steps today").fill("5000");
    await andSettle(other, () => otherSteps.getByRole("button", { name: "Save" }).click());
    await expect(other.getByText(CHANGED)).toBeVisible();
    await expect(otherSteps).toBeHidden();
    await expect(steps(other)).toContainText("8.000 / 10.000");
    await dismissToast(other, CHANGED);

    // A goal: the other device's goals form shows 3.350 kcal while this one saves 2.800; its save of 3.000 is refused.
    await other.getByRole("button", { name: "Edit goals" }).click();
    const otherGoals = other.getByRole("dialog", { name: "Edit goals" });
    await expect(otherGoals.getByLabel("Calories (kcal)")).toHaveValue("3.350");
    await page.getByRole("button", { name: "Edit goals" }).click();
    const goalsForm = page.getByRole("dialog", { name: "Edit goals" });
    await goalsForm.getByLabel("Calories (kcal)").fill("2800");
    await andSettle(page, () => goalsForm.getByRole("button", { name: "Save" }).click());
    await expect(page.getByText("Saved nutrition goals")).toBeVisible();
    await otherGoals.getByLabel("Calories (kcal)").fill("3000");
    await andSettle(other, () => otherGoals.getByRole("button", { name: "Save" }).click());
    await expect(other.getByText(CHANGED)).toBeVisible();
    await expect(otherGoals).toBeHidden();
    await expect(other.getByText("/ 2.800 kcal", { exact: true })).toBeVisible();

    // The database kept the first device's changes.
    await openHealth(page, "Today");
    await expect(water(page)).toContainText("250 / 3.000 ml");
    await expect(steps(page)).toContainText("8.000 / 10.000");
    await expect(page.getByRole("region", { name: "Nutrition" }).getByText("/ 2.800 kcal", { exact: true })).toBeVisible();
  } finally {
    await device.close();
  }
});

// Each form says what is wrong in words that name the field, with no full stop, as the server would; a negative meal
// value is refused before anything is sent.
test("the water, steps and meal forms refuse a value out of range in words that name the field, and send nothing", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && "next-action" in r.headers()) writes.push(r.postData() ?? "");
  });

  await page.getByRole("region", { name: "Water" }).getByRole("button", { name: "Edit water and goal" }).click();
  const waterForm = page.getByRole("dialog", { name: "Edit water" });
  await waterForm.getByLabel("Water today (ml)").fill("20001");
  await waterForm.getByRole("button", { name: "Save" }).click();
  await expect(waterForm.getByRole("alert")).toHaveText("The total must be between 0 and 20.000");
  await waterForm.getByLabel("Water today (ml)").fill("500");
  await waterForm.getByLabel("Daily goal (ml)").fill("100");
  await waterForm.getByRole("button", { name: "Save" }).click();
  await expect(waterForm.getByRole("alert")).toHaveText("The goal must be between 500 and 15.000");
  await waterForm.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("region", { name: "Steps" }).getByRole("button", { name: "Edit steps and goal" }).click();
  const stepsForm = page.getByRole("dialog", { name: "Edit steps" });
  await stepsForm.getByLabel("Steps today").fill("-2");
  await stepsForm.getByRole("button", { name: "Save" }).click();
  await expect(stepsForm.getByRole("alert")).toHaveText("The total must be between 0 and 200.000");
  await stepsForm.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Add meal" }).click();
  const mealForm = page.getByRole("dialog", { name: "New meal" });
  await mealForm.getByLabel("Protein (g)").fill("10");
  await mealForm.getByLabel("Fat (g)").fill("-1");
  await mealForm.getByRole("button", { name: "Save" }).click();
  await expect(mealForm.getByRole("alert")).toHaveText(MEAL_MACROS_NEGATIVE);
  await mealForm.getByLabel("Fat (g)").fill("");
  await mealForm.getByLabel("Calories (kcal)").fill("-5");
  await mealForm.getByRole("button", { name: "Save" }).click();
  await expect(mealForm.getByRole("alert")).toHaveText(MEAL_CALORIES_NEGATIVE);
  await mealForm.getByRole("button", { name: "Cancel" }).click();

  expect(writes).toEqual([]);
  await openHealth(page, "Today");
  await expect(page.getByRole("region", { name: "Water" })).toContainText("0 / 3.000 ml");
  await expect(page.getByRole("region", { name: "Steps" })).toContainText("0 / 10.000");
  await expect(page.getByRole("button", { name: /^Delete Meal of / })).toHaveCount(0);
});

// Holds the edit save that sets a value to `to` (a water total or a goal) until `release` is called, then lets it
// through or loses it.
async function holdSave(page: Page, to: number) {
  let release: (lose: boolean) => void = () => {};
  const held = new Promise<boolean>((resolve) => (release = resolve));
  let answered: () => void = () => {};
  const done = new Promise<void>((resolve) => (answered = resolve));
  await page.route("**/health", async (route) => {
    if (route.request().method() !== "POST" || !(route.request().postData() ?? "").includes(`"to":${to}`)) return route.fallback();
    if (await held) await route.abort();
    else await route.fallback();
    answered();
  });
  return { release, done };
}

// A quick water tap sends the total on screen as the value it changes (D-040): while a water edit's save is unanswered
// that total is about to change, so the taps wait for the answer instead of being refused as changed elsewhere.
test("the water taps wait while a water edit's save is unanswered, then add to the saved total [D-043]", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");
  const water = page.getByRole("region", { name: "Water" });
  const form = page.getByRole("dialog", { name: "Edit water" });
  const save = await holdSave(page, 1000);
  await water.getByRole("button", { name: "Edit water and goal" }).click();
  await form.getByLabel("Water today (ml)").fill("1000");
  await form.getByRole("button", { name: "Save" }).click();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();
  await expect(water.getByRole("button", { name: "+250 ml" })).toBeDisabled();
  await expect(water.getByRole("button", { name: "+500 ml" })).toBeDisabled();

  save.release(false);
  await save.done;
  await page.unroute("**/health");
  await expect(page.getByText("Water set to 1.000 ml", { exact: true })).toBeVisible();
  await andSettle(page, () => water.getByRole("button", { name: "+250 ml" }).click());
  await expect(water).toContainText("1.250 / 3.000 ml");
  await expect(page.getByText("This changed on another device")).toHaveCount(0);
  await openHealth(page, "Today");
  await expect(water).toContainText("1.250 / 3.000 ml");
});

// Water and steps share one dialog, and the Today tab one form error: a water save lost after its form was closed shows
// nothing in the steps or meal form opened meanwhile, and shows in its own form while that one is open.
test("a lost water save shows its error only in the water form, not in the steps or meal form opened meanwhile", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");
  const water = page.getByRole("region", { name: "Water" });
  const waterForm = page.getByRole("dialog", { name: "Edit water" });
  const startWaterSave = async (to: number) => {
    const save = await holdSave(page, to);
    await water.getByRole("button", { name: "Edit water and goal" }).click();
    await waterForm.getByLabel("Water today (ml)").fill(String(to));
    await waterForm.getByRole("button", { name: "Save" }).click();
    return save;
  };

  // The steps form, opened while the water save is out, waits for it and then shows no error of its own.
  let save = await startWaterSave(1000);
  await waterForm.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("region", { name: "Steps" }).getByRole("button", { name: "Edit steps and goal" }).click();
  const stepsForm = page.getByRole("dialog", { name: "Edit steps" });
  await expect(stepsForm.getByRole("button", { name: "Saving..." })).toBeDisabled();
  save.release(true);
  await save.done;
  await page.unroute("**/health");
  await expect(stepsForm.getByRole("button", { name: "Save" })).toBeEnabled();
  await expect(stepsForm.getByRole("alert")).toHaveCount(0);
  await stepsForm.getByRole("button", { name: "Cancel" }).click();

  // The meal form, the same.
  save = await startWaterSave(1100);
  await waterForm.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Add meal" }).click();
  const mealForm = page.getByRole("dialog", { name: "New meal" });
  save.release(true);
  await save.done;
  await page.unroute("**/health");
  await expect(water.getByRole("button", { name: "+250 ml" })).toBeEnabled();
  await expect(mealForm.getByRole("alert")).toHaveCount(0);
  await mealForm.getByRole("button", { name: "Cancel" }).click();

  // Kept open, the water form shows its own failure.
  save = await startWaterSave(1200);
  save.release(true);
  await save.done;
  await page.unroute("**/health");
  await expect(waterForm.getByRole("alert")).toHaveText("Failed to save water");
});

// The goals form shares the Today tab's one form error too: a goals save lost after its form was closed shows nothing in
// the water form opened meanwhile, and shows in its own form while that one is open.
test("a lost goals save shows its error only in the goals form, not in the water form opened meanwhile", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");
  const nutrition = page.getByRole("region", { name: "Nutrition" });
  const goalsForm = page.getByRole("dialog", { name: "Edit goals" });
  const startGoalsSave = async (to: number) => {
    const save = await holdSave(page, to);
    await nutrition.getByRole("button", { name: "Edit goals" }).click();
    await goalsForm.getByLabel("Calories (kcal)").fill(String(to));
    await goalsForm.getByRole("button", { name: "Save" }).click();
    return save;
  };

  let save = await startGoalsSave(2800);
  await goalsForm.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("region", { name: "Water" }).getByRole("button", { name: "Edit water and goal" }).click();
  const waterForm = page.getByRole("dialog", { name: "Edit water" });
  await expect(waterForm).toBeVisible();
  // Nothing outside the goals form shows that its save is out, so every alert a form shows from here on is recorded,
  // and the water form's own save, a whole round trip later, is the point by which the lost goals answer was handled.
  await page.evaluate(() => {
    const shown: string[] = [];
    Object.assign(window, { formAlerts: shown });
    new MutationObserver(() => {
      for (const alert of document.querySelectorAll('[role="dialog"] [role="alert"]')) shown.push(alert.textContent ?? "");
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  save.release(true);
  await save.done;
  await page.unroute("**/health");
  await waterForm.getByLabel("Water today (ml)").fill("750");
  await andSettle(page, () => waterForm.getByRole("button", { name: "Save" }).click());
  await expect(waterForm).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { formAlerts: string[] }).formAlerts)).toEqual([]);

  save = await startGoalsSave(2900);
  save.release(true);
  await save.done;
  await page.unroute("**/health");
  await expect(goalsForm.getByRole("alert")).toHaveText("Failed to save goals");
});
