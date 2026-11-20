import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { andSettle, burst, center, expectNoSeriousViolations, test } from "./helpers";

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

async function addItem(page: Page, name: string, amount: number) {
  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New shopping item" });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Amount").fill(String(amount));
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

test("the meal form keeps Save off until a value survives rounding, shows the server's refusal and reads the app's number format [HTODAY-06, HTODAY-04, HTODAY-05, HTODAY-13]", async ({
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

  // A negative number is no value either; with a macro beside it, the form sends it and shows what the server said.
  await field("Protein (g)").fill("");
  await field("Calories (kcal)").fill("-100");
  await expect(save).toBeDisabled();
  await field("Protein (g)").fill("30");
  await andSettle(page, () => save.click());
  await expect(form.getByText("Must be at least 0")).toBeVisible();
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
  const undoIn = (message: string) => toast(message).getByRole("button", { name: "Undo" });
  await openHealth(page, "Today");
  await addMeal(page);
  await expect(undoIn("Added meal (450 kcal)")).toBeVisible();
  // Shift ends the last tap burst (D-043); this test is about the toasts, not the guard.
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("region", { name: "Water" }).getByRole("button", { name: "+250 ml" }).click());
  await expect(undoIn("Added 250 ml")).toBeVisible();
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: deleteMeal("450") }).click());
  await expect(undoIn('Removed "Meal"')).toBeVisible();
  // Counted at once, not with a retrying assertion, which an expiring toast would also satisfy; the toast is still
  // there afterwards, so its Undo is gone from a toast on screen.
  expect(await undoIn("Added meal (450 kcal)").count()).toBe(0);
  await expect(toast("Added meal (450 kcal)")).toBeVisible();
  await expect(undoIn("Added 250 ml")).toBeVisible();
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
