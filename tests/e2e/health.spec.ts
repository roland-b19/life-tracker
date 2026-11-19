import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { andSettle, expectNoSeriousViolations, test } from "./helpers";

// The page opens on the Today tab, so a reload (which also starts there) goes through here too. On a phone the
// Shopping tab shows its short label "Shop", hence the pattern.
async function openHealth(page: Page, tab: "Today" | "Shopping") {
  await page.goto("/health");
  await expect(page).toHaveURL(/\/health$/);
  if (tab === "Shopping") {
    await page.getByRole("tab", { name: /^Shop(ping)?$/ }).click();
    await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: "Add meal" })).toBeVisible();
  }
}

async function dismissToast(page: Page, message: string) {
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByText(message)).toBeHidden();
}

// The meal form has no name field; the server names the meal "Meal". Its numbers are two lines under the name.
const MEAL_NUMBERS = "450 kcal · P 30";

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
  await expect(nutrition).toContainText(/Calories\s*450\s*\/ 3350 kcal/);

  // Undo the log: the meal is gone, also after a reload.
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(empty).toBeVisible();
  await expect(nutrition).toContainText(/Calories\s*0\s*\/ 3350 kcal/);
  await openHealth(page, "Today");
  await expect(empty).toBeVisible();

  // Log it again: it is still there after a reload, so the database has it.
  await addMeal(page);
  await dismissToast(page, "Added meal (450 kcal)");
  await openHealth(page, "Today");
  await expect(meal).toBeVisible();

  // Delete it, then Undo the delete: the same meal comes back, also after a reload.
  await andSettle(page, () => page.getByRole("button", { name: "Delete Meal" }).click());
  await expect(empty).toBeVisible();
  await expect(page.getByText('Removed "Meal"')).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(meal).toBeVisible();
  await expect(nutrition).toContainText(/Calories\s*450\s*\/ 3350 kcal/);
  await openHealth(page, "Today");
  await expect(meal).toBeVisible();

  // Delete it for good: the database lost it.
  await andSettle(page, () => page.getByRole("button", { name: "Delete Meal" }).click());
  await expect(empty).toBeVisible();
  await openHealth(page, "Today");
  await expect(empty).toBeVisible();
});

test("a signed-in user edits the nutrition goals, with Undo, also after a reload", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");

  const nutrition = page.getByRole("region", { name: "Nutrition" });
  const goals = (calories: number, protein: number, carbs: number, fat: number) =>
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
    await goals(2800, 150, 250, 70);
  };

  // The defaults.
  await goals(3350, 170, 300, 80);

  // Save new goals; Undo puts the defaults back, also after a reload.
  await saveGoals();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await goals(3350, 170, 300, 80);
  await openHealth(page, "Today");
  await goals(3350, 170, 300, 80);

  // Save them again: they are still the new ones after a reload.
  await saveGoals();
  await openHealth(page, "Today");
  await goals(2800, 150, 250, 70);
});

test("a signed-in user adds water, sets water and steps with their goals, with Undo, also after a reload", async ({ signedInPage: page }) => {
  await openHealth(page, "Today");

  const water = page.getByRole("region", { name: "Water" });
  const steps = page.getByRole("region", { name: "Steps" });

  await expect(water).toContainText("0 / 3000 ml");
  await expect(steps).toContainText("0 / 10000");

  // A quick tap adds at once; Undo takes exactly that back, also after a reload.
  await andSettle(page, () => water.getByRole("button", { name: "+250 ml" }).click());
  await expect(page.getByText("Added 250 ml")).toBeVisible();
  await expect(water).toContainText("250 / 3000 ml");
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(water).toContainText("0 / 3000 ml");
  await openHealth(page, "Today");
  await expect(water).toContainText("0 / 3000 ml");

  // Tap again: 250 is what the database holds after a reload.
  await andSettle(page, () => water.getByRole("button", { name: "+250 ml" }).click());
  await dismissToast(page, "Added 250 ml");
  await openHealth(page, "Today");
  await expect(water).toContainText("250 / 3000 ml");

  // Set the total and the goal. The goal is the second write, so the piece of body names that one: the toast shows
  // only after both are saved.
  await water.getByRole("button", { name: "Edit water and goal" }).click();
  const waterForm = page.getByRole("dialog", { name: "Edit water" });
  await expect(waterForm.getByLabel("Water today (ml)")).toHaveValue("250");
  await waterForm.getByLabel("Water today (ml)").fill("1200");
  await waterForm.getByLabel("Daily goal (ml)").fill("2500");
  await andSettle(page, () => waterForm.getByRole("button", { name: "Save" }).click(), `"waterMl":2500`);
  await expect(waterForm).toBeHidden();
  await expect(page.getByText("Water set to 1200 ml, goal 2500 ml")).toBeVisible();
  await expect(water).toContainText("1200 / 2500 ml");
  await openHealth(page, "Today");
  await expect(water).toContainText("1200 / 2500 ml");

  // Undo of an edit needs its toast, so edit once more and Undo it: total and goal both go back.
  await water.getByRole("button", { name: "Edit water and goal" }).click();
  await waterForm.getByLabel("Water today (ml)").fill("1800");
  await waterForm.getByLabel("Daily goal (ml)").fill("3500");
  await andSettle(page, () => waterForm.getByRole("button", { name: "Save" }).click(), `"waterMl":3500`);
  await expect(page.getByText("Water set to 1800 ml, goal 3500 ml")).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click(), `"waterMl":2500`);
  await expect(water).toContainText("1200 / 2500 ml");
  await openHealth(page, "Today");
  await expect(water).toContainText("1200 / 2500 ml");

  // Steps: set the total and the goal, then Undo.
  await steps.getByRole("button", { name: "Edit steps and goal" }).click();
  const stepsForm = page.getByRole("dialog", { name: "Edit steps" });
  await stepsForm.getByLabel("Steps today").fill("8000");
  await stepsForm.getByLabel("Daily goal (steps)").fill("12000");
  await andSettle(page, () => stepsForm.getByRole("button", { name: "Save" }).click(), `"steps":12000`);
  await expect(stepsForm).toBeHidden();
  await expect(page.getByText("Steps set to 8000, goal 12000")).toBeVisible();
  await expect(steps).toContainText("8000 / 12000");
  await openHealth(page, "Today");
  await expect(steps).toContainText("8000 / 12000");

  await steps.getByRole("button", { name: "Edit steps and goal" }).click();
  await stepsForm.getByLabel("Steps today").fill("9500");
  await stepsForm.getByLabel("Daily goal (steps)").fill("15000");
  await andSettle(page, () => stepsForm.getByRole("button", { name: "Save" }).click(), `"steps":15000`);
  await expect(page.getByText("Steps set to 9500, goal 15000")).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click(), `"steps":12000`);
  await expect(steps).toContainText("8000 / 12000");
  await openHealth(page, "Today");
  await expect(steps).toContainText("8000 / 12000");
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
