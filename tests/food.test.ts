import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", async () => (await import("./auth")).authModule);
import { authState, seedUser } from "./auth";

import { succeeded } from "./succeeded";
import { SIGNED_OUT } from "@/lib/validations/result";
import { CHANGED_ELSEWHERE, MAX_WATER_ML, mealHasValue } from "@/lib/validations/food";
import { db } from "@/server/db";
import { addDays, toISODate } from "@/lib/format-date";
import { eq } from "drizzle-orm";
import { dailyMetrics, weightEntries } from "@/db/schema";
import {
  addShoppingItem,
  deleteMeal,
  getDailyFoodSummary,
  getNutritionTargets,
  clearBoughtShoppingItems,
  getShoppingCategories,
  getShoppingList,
  getDailyMetricsHistory,
  getPastFoods,
  listWeightEntries,
  logMeal,
  renameShoppingCategory,
  reorderShoppingCategories,
  restoreShoppingItems,
  saveWeightEntry,
  toggleShoppingItem,
  updateDailySteps,
  updateDailyWater,
  updateNutritionTargets,
  updateShoppingItem,
} from "@/lib/food";
import {
  setWaterAction,
  clearBoughtItemsAction,
  addShoppingCategoryAction,
  addShoppingItemAction,
  deleteMealAction,
  deleteShoppingItemAction,
  deleteShoppingCategoryAction,
  logMealAction,
  renameShoppingCategoryAction,
  reorderShoppingCategoriesAction,
  restoreMealAction,
  restoreShoppingItemsAction,
  restoreWeightAction,
  saveWeightAction,
  deleteWeightAction,
  revertShoppingCategoryAction,
  updateShoppingItemAction,
  toggleShoppingItemAction,
  updateStepsAction,
  updateTargetsAction,
} from "@/actions/food";

const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

describe("Food & Nutrition module: Data Access, Analytics & Authorization", () => {
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    await admin.query(
      "TRUNCATE TABLE shopping_items, recipe_ingredients, recipes, meals, daily_metrics, nutrition_targets, workout_sets, workout_sessions, workout_split_day_exercises, workout_split_days, workout_splits, exercises, weight_entries, users CASCADE",
    );
  });

  beforeEach(async () => {
    await admin.query(
      "TRUNCATE TABLE shopping_items, recipe_ingredients, recipes, meals, daily_metrics, nutrition_targets, workout_sets, workout_sessions, workout_split_day_exercises, workout_split_days, workout_splits, exercises, weight_entries, users CASCADE",
    );
    userA = await seedUser(`user-a-${randomUUID()}`);
    userB = await seedUser(`user-b-${randomUUID()}`);
    authState.id = userA;
  });

  afterAll(async () => {
    await admin.end();
  });

  it("seeds default user nutrition targets (3350 kcal, 170g protein, 300g carbs, 3L water, 10k steps)", async () => {
    const targets = await getNutritionTargets(userA);
    expect(targets.calories).toBe(3350);
    expect(targets.proteinGrams).toBe(170);
    expect(targets.carbsGrams).toBe(300);
    expect(targets.waterMl).toBe(3000);
    expect(targets.steps).toBe(10000);
  });

  it("allows user to update nutrition targets", async () => {
    const updated = await updateNutritionTargets(userA, {
      calories: { from: 3350, to: 3500 },
      proteinGrams: { from: 170, to: 180 },
      carbsGrams: { from: 300, to: 320 },
      fatGrams: { from: 80, to: 85 },
      waterMl: { from: 3000, to: 3500 },
      steps: { from: 10000, to: 12000 },
    });

    expect(updated.calories).toBe(3500);
    expect(updated.proteinGrams).toBe(180);

    // User B still gets default targets
    const targetsB = await getNutritionTargets(userB);
    expect(targetsB.calories).toBe(3350);
  });

  it("enforces multi-user isolation on meals and daily metrics", async () => {
    const today = "2026-11-04";

    // User A logs a meal and water
    await logMeal(userA, {
      date: today,
      name: "Chicken & Rice",
      calories: 650,
      protein: 55,
      carbs: 75,
      fat: 10,
    });
    await updateDailyWater(userA, today, { from: 0, to: 500 });
    await updateDailySteps(userA, today, { from: 0, to: 8500 });

    // Summary for User A has these totals
    const summaryA = await getDailyFoodSummary(userA, today);
    expect(summaryA.meals).toHaveLength(1);
    expect(summaryA.totals.calories).toBe(650);
    expect(summaryA.totals.protein).toBe(55);
    expect(summaryA.metrics.waterMl).toBe(500);
    expect(summaryA.metrics.steps).toBe(8500);

    // Summary for User B has zero
    const summaryB = await getDailyFoodSummary(userB, today);
    expect(summaryB.meals).toHaveLength(0);
    expect(summaryB.totals.calories).toBe(0);
    expect(summaryB.metrics.waterMl).toBe(0);
    expect(summaryB.metrics.steps).toBe(0);
  });

  it("prevents cross-user meal deletion", async () => {
    const meal = (await logMeal(userA, {
      date: "2026-11-04",
      name: "Salmon",
      calories: 500,
      protein: 40,
      carbs: 10,
      fat: 25,
    }))!;

    // User B tries to delete User A's meal -> fails / returns undefined
    const deletedByB = await deleteMeal(userB, meal.id);
    expect(deletedByB).toBeUndefined();

    // User A can delete their own meal
    const deletedByA = await deleteMeal(userA, meal.id);
    expect(deletedByA?.id).toBe(meal.id);
  });

  it("deletes a meal and Undo brings the same row back: id, time, macros, estimate flag", async () => {
    const today = toISODate();
    const meal = succeeded(await logMealAction({ date: today, name: "Salmon", calories: 500, protein: 40.5, carbs: 10, fat: 25.2, isEstimated: true })).meal!;
    const [before] = (await getDailyFoodSummary(userA, today)).meals;
    expect(before.id).toBe(meal.id);
    const undo = { id: meal.id, date: today, name: meal.name, calories: meal.calories, protein: 40.5, carbs: 10, fat: 25.2, isEstimated: true, createdAt: meal.createdAt.toISOString() };
    authState.id = userB;
    expect(succeeded(await deleteMealAction(meal.id)).deleted).toBeUndefined(); // another user's delete changes nothing
    expect((await restoreMealAction(undo)).success).toBe(false); // the id is taken, so B cannot claim or overwrite it
    expect((await getDailyFoodSummary(userA, today)).meals).toEqual([before]);
    authState.id = userA;
    expect(succeeded(await deleteMealAction(meal.id)).deleted?.id).toBe(meal.id);
    expect((await getDailyFoodSummary(userA, today)).meals).toHaveLength(0);
    expect((await restoreMealAction(undo)).success).toBe(true);
    expect((await getDailyFoodSummary(userA, today)).meals).toEqual([before]);
    expect((await restoreMealAction(undo)).success).toBe(false); // a second Undo adds nothing
    expect((await getDailyFoodSummary(userA, today)).meals).toHaveLength(1);
    await expect(restoreMealAction({ ...undo, date: addDays(today, -2) })).resolves.toEqual({ success: false, error: "Only today and yesterday can be changed." });
    authState.id = "";
    expect(await restoreMealAction(undo)).toEqual({ success: false, error: SIGNED_OUT });
    expect(await deleteMealAction(meal.id)).toEqual({ success: false, error: SIGNED_OUT });
  });

  it("refuses a rename onto itself, and an Undo never deletes the name it puts back", async () => {
    await addShoppingCategoryAction({ name: "snacks" });
    await expect(renameShoppingCategoryAction({ from: "snacks", to: " Snacks " })).resolves.toEqual({ success: false, error: "That is already its name." });
    await revertShoppingCategoryAction({ name: "snacks", current: "snacks", sortOrder: 0, itemIds: [], dropCurrent: true });
    expect(await getShoppingCategories(userA)).toContain("snacks"); // an Undo never deletes the name it puts back
  });

  it("lists past foods newest first, one per name, up to the limit", async () => {
    for (let i = 0; i < 5; i++) await logMeal(userA, { date: "2026-10-31", name: `Food ${i}`, calories: 100, protein: 1, carbs: 1, fat: 1 });
    await logMeal(userA, { date: "2026-10-31", name: "FOOD 0", calories: 250, protein: 1, carbs: 1, fat: 1 }); // same name, other case, logged last
    const foods = await getPastFoods(userA, 3);
    expect(foods.map((f) => f.name.toLowerCase())).toEqual(["food 0", "food 4", "food 3"]);
    expect(foods[0].calories).toBe(250);
  });

  it("leaves meals the old forget feature hid out of past foods", async () => {
    await logMeal(userA, { date: "2026-10-31", name: "Hidden", calories: 100, protein: 1, carbs: 1, fat: 1 });
    await logMeal(userA, { date: "2026-10-31", name: "Shown", calories: 100, protein: 1, carbs: 1, fat: 1 });
    await admin.query("UPDATE meals SET forgotten = true WHERE user_id = $1 AND name = 'Hidden'", [userA]);
    expect((await getPastFoods(userA)).map((f) => f.name)).toEqual(["Shown"]);
  });

  it("deletes a shopping item softly, and Undo brings it back exactly, bought state included", async () => {
    authState.id = userA;
    const item = await addShoppingItem(userA, { name: "Milk", amount: 2, unit: "l", category: "dairy" });
    await toggleShoppingItem(userA, item.id, true);
    const [before] = (await getShoppingList(userA)).filter((i) => i.id === item.id);
    expect((await deleteShoppingItemAction(item.id)).success).toBe(true);
    expect(await getShoppingList(userA)).toHaveLength(0);
    authState.id = userB;
    await expect(restoreShoppingItemsAction({ itemIds: [item.id] })).resolves.toEqual({ success: false, error: "Item not found." });
    authState.id = userA;
    await restoreShoppingItemsAction({ itemIds: [item.id] });
    expect((await getShoppingList(userA))[0]).toEqual(before);
    // "Add again" onto a bought item starts it over; Undo puts amount, bought flag and time back.
    const again = await addShoppingItem(userA, { name: "Milk", amount: 1, unit: "l", category: "dairy" });
    expect(again.isBought).toBe(false);
    await updateShoppingItem(userA, { itemId: item.id, name: before.name, amount: Number(before.amount), unit: before.unit, category: before.category, isBought: before.isBought, checkedAt: before.checkedAt });
    expect((await getShoppingList(userA))[0]).toEqual(before);
    authState.id = "";
    expect(await deleteShoppingItemAction(item.id)).toEqual({ success: false, error: SIGNED_OUT });
  });

  it("ticks and deletes a shopping item for the owner only", async () => {
    const item = await addShoppingItem(userA, { name: "Bread", amount: 1, unit: "pcs", category: "pantry" });
    const bought = async () => (await getShoppingList(userA)).find((i) => i.id === item.id)?.isBought;
    authState.id = userB;
    await expect(toggleShoppingItemAction(item.id, true)).resolves.toEqual({ success: false, error: "Item not found." });
    await expect(deleteShoppingItemAction(item.id)).resolves.toEqual({ success: false, error: "Item not found." });
    authState.id = "";
    expect(await toggleShoppingItemAction(item.id, true)).toEqual({ success: false, error: SIGNED_OUT });
    expect(await deleteShoppingItemAction(item.id)).toEqual({ success: false, error: SIGNED_OUT });
    expect(await bought()).toBe(false); // still on A's list, untouched
    authState.id = userA;
    await toggleShoppingItemAction(item.id, true);
    expect(await bought()).toBe(true);
  });

  it("merges the same item, keeps cleared items as history, edits and renames categories", async () => {
    const oil = await addShoppingItem(userA, { name: "Olive Oil", amount: 1, unit: "bottle", category: "pantry" });
    // Same name (any case) and unit: one row, amounts added.
    const merged = await addShoppingItem(userA, { name: "olive oil", amount: 2, unit: "bottle", category: "other" });
    expect(merged.id).toBe(oil.id);
    expect(Number(merged.amount)).toBe(3);
    // Another unit stays its own row.
    await addShoppingItem(userA, { name: "Olive Oil", amount: 500, unit: "ml", category: "pantry" });
    expect(await getShoppingList(userA)).toHaveLength(2);

    // A bought item added again starts over, not bought.
    await toggleShoppingItem(userA, oil.id, true);
    const again = await addShoppingItem(userA, { name: "Olive Oil", amount: 1, unit: "bottle", category: "pantry" });
    expect(again.id).toBe(oil.id);
    expect(Number(again.amount)).toBe(1);
    expect(again.isBought).toBe(false);

    // Clearing hides bought items; undo brings them back.
    await toggleShoppingItem(userA, oil.id, true);
    // Only the ids given are cleared: a bought item the screen did not show stays.
    expect(await clearBoughtShoppingItems(userA, [])).toEqual([]);
    const cleared = await clearBoughtShoppingItems(userA, [oil.id]);
    expect(cleared.map((i) => i.id)).toEqual([oil.id]);
    expect((await getShoppingList(userA)).map((i) => i.unit)).toEqual(["ml"]);
    await restoreShoppingItems(userA, [oil.id]);
    expect(await getShoppingList(userA)).toHaveLength(2);

    const edited = await updateShoppingItem(userA, { itemId: oil.id, name: "Rapeseed Oil", amount: 2, unit: "l", category: "oils" });
    expect(edited).toMatchObject({ name: "Rapeseed Oil", unit: "l", category: "oils" });
    expect(await renameShoppingCategory(userA, "pantry", "dry goods")).not.toBeNull();
    expect((await getShoppingList(userA)).map((i) => i.category).sort()).toEqual(["dry goods", "oils"]);

    // Reordering puts the owner's categories in the given order; another user changes nothing.
    await reorderShoppingCategories(userA, ["oils", "dry goods"]);
    const order = async () => (await getShoppingCategories(userA)).filter((c) => ["oils", "dry goods"].includes(c));
    expect(await order()).toEqual(["oils", "dry goods"]);
    await reorderShoppingCategories(userB, ["dry goods", "oils"]);
    expect(await order()).toEqual(["oils", "dry goods"]);

    // User B sees, changes and restores none of it.
    expect(await getShoppingList(userB)).toHaveLength(0);
    expect(await updateShoppingItem(userB, { itemId: oil.id, name: "X", amount: 1, unit: "pcs", category: "other" })).toBeUndefined();
    expect(await renameShoppingCategory(userB, "oils", "x")).toBeNull();
    expect(await restoreShoppingItems(userB, [oil.id])).toHaveLength(0);
  });

  it("lists a just-bought item first among the bought and a just-unticked one last among the unbought", async () => {
    const names = async () => (await getShoppingList(userA)).map((i) => i.name);
    const [a, b, c] = [
      await addShoppingItem(userA, { name: "Apples", amount: 1, unit: "kg", category: "produce" }),
      await addShoppingItem(userA, { name: "Bread", amount: 1, unit: "pcs", category: "produce" }),
      await addShoppingItem(userA, { name: "Cheese", amount: 1, unit: "pack", category: "produce" }),
    ];
    // checked_at has millisecond resolution, so each tick needs its own millisecond.
    const tick = () => new Promise((r) => setTimeout(r, 5));
    await toggleShoppingItem(userA, a.id, true);
    await tick();
    await toggleShoppingItem(userA, b.id, true);
    await tick();
    expect(await names()).toEqual(["Cheese", "Bread", "Apples"]);
    await toggleShoppingItem(userA, a.id, false);
    expect(await names()).toEqual(["Cheese", "Apples", "Bread"]);
    expect(c.isBought).toBe(false);
  });

  describe("Server Actions for Food", () => {
    it("answers every signed-out call with the signed-out error and writes nothing", async () => {
      authState.id = "";
      const itemId = randomUUID();
      const today = toISODate();
      const answers = await Promise.all([
        logMealAction({ date: today, name: "Test", calories: 100, protein: 10, carbs: 10, fat: 2 }),
        deleteMealAction(itemId),
        restoreMealAction({ id: itemId, date: today, name: "Test", calories: 100, protein: 0, carbs: 0, fat: 0 }),
        saveWeightAction({ date: today, kilograms: 80 }),
        deleteWeightAction(itemId),
        restoreWeightAction({ id: itemId, date: today, kilograms: 80 }),
        setWaterAction({ date: today, waterMl: { from: 0, to: 250 } }),
        updateStepsAction({ date: today, steps: { from: 0, to: 5000 } }),
        updateTargetsAction({ calories: { from: 3350, to: 2000 } }),
        addShoppingItemAction({ name: "Eggs" }),
        toggleShoppingItemAction(itemId, true),
        deleteShoppingItemAction(itemId),
        clearBoughtItemsAction({ itemIds: [itemId] }),
        updateShoppingItemAction({ itemId, name: "Eggs", amount: 1, unit: "pcs", category: "dairy" }),
        renameShoppingCategoryAction({ from: "dairy", to: "fridge" }),
        restoreShoppingItemsAction({ itemIds: [itemId] }),
        reorderShoppingCategoriesAction({ names: ["dairy"] }),
        addShoppingCategoryAction({ name: "frozen" }),
        deleteShoppingCategoryAction({ name: "dairy" }),
        revertShoppingCategoryAction({ name: "dairy", current: "other", sortOrder: 1, itemIds: [itemId], dropCurrent: false }),
        // The same actions on the unit list.
        addShoppingCategoryAction({ kind: "unit", name: "tin" }),
        renameShoppingCategoryAction({ kind: "unit", from: "kg", to: "kilo" }),
        deleteShoppingCategoryAction({ kind: "unit", name: "kg" }),
        reorderShoppingCategoriesAction({ kind: "unit", names: ["kg"] }),
        revertShoppingCategoryAction({ kind: "unit", name: "kg", current: "pcs", sortOrder: 1, itemIds: [itemId], dropCurrent: false }),
      ]);
      for (const answer of answers) expect(answer).toEqual({ success: false, error: SIGNED_OUT });
      const { rows } = await admin.query(
        "SELECT (SELECT count(*) FROM meals) + (SELECT count(*) FROM weight_entries) + (SELECT count(*) FROM daily_metrics) + (SELECT count(*) FROM shopping_items) AS n",
      );
      expect(Number(rows[0].n)).toBe(0);
    });

    it("manages shopping categories, owner only, with \"other\" as the fixed fallback", async () => {
      const owner = await seedUser(`categories-${randomUUID()}`);
      const stranger = await seedUser(`categories-${randomUUID()}`);
      expect(await getShoppingCategories(owner)).toEqual(["meat", "produce", "dairy", "bakery", "pantry"]);

      authState.id = owner;
      expect((await addShoppingCategoryAction({ name: " Frozen " })).success).toBe(true);
      expect((await addShoppingCategoryAction({ name: "frozen" })).success).toBe(false);
      await expect(addShoppingCategoryAction({ name: "Other" })).resolves.toMatchObject({ success: false });
      await expect(renameShoppingCategoryAction({ from: "frozen", to: "other" })).resolves.toMatchObject({ success: false });
      expect((await getShoppingCategories(owner)).at(-1)).toBe("frozen");

      // A category an item brings along (for example from the assistant) joins the list.
      const { item } = succeeded(await addShoppingItemAction({ name: "Peas", category: "freezer" }));
      expect(await getShoppingCategories(owner)).toContain("freezer");

      // Renaming onto an existing name merges; deleting moves the items to "other".
      expect((await renameShoppingCategoryAction({ from: "freezer", to: "frozen" })).success).toBe(true);
      expect((await getShoppingList(owner))[0].category).toBe("frozen");
      expect((await getShoppingCategories(owner)).filter((c) => c.startsWith("fr"))).toEqual(["frozen"]);

      authState.id = stranger;
      expect((await renameShoppingCategoryAction({ from: "frozen", to: "mine" })).success).toBe(false);
      expect((await deleteShoppingCategoryAction({ name: "frozen" })).success).toBe(false);
      expect((await getShoppingList(owner))[0].category).toBe("frozen");

      authState.id = owner;
      expect((await deleteShoppingCategoryAction({ name: "frozen" })).success).toBe(true);
      expect((await getShoppingList(owner)).find((i) => i.id === item.id)?.category).toBe("other");
      expect(await getShoppingCategories(owner)).not.toContain("frozen");
      authState.id = "";
    });

    it("manages shopping units like categories, owner only, with \"pcs\" as the fixed fallback", async () => {
      const owner = await seedUser(`units-${randomUUID()}`);
      const stranger = await seedUser(`units-${randomUUID()}`);
      expect((await getShoppingCategories(owner, "unit")).slice(0, 3)).toEqual(["g", "kg", "ml"]);
      expect(await getShoppingCategories(owner, "unit")).not.toContain("pcs");

      authState.id = owner;
      expect((await addShoppingCategoryAction({ kind: "unit", name: " TIN " })).success).toBe(true);
      expect((await addShoppingCategoryAction({ kind: "unit", name: "tin" })).success).toBe(false);
      await expect(addShoppingCategoryAction({ kind: "unit", name: "pcs" })).resolves.toMatchObject({ success: false });
      await expect(addShoppingCategoryAction({ kind: "unit", name: "x".repeat(31) })).resolves.toMatchObject({ success: false });
      await expect(renameShoppingCategoryAction({ kind: "unit", from: "tin", to: "pcs" })).resolves.toMatchObject({ success: false });
      // "other" is a category fallback only; a unit may use it.
      expect((await addShoppingCategoryAction({ kind: "unit", name: "other" })).success).toBe(true);
      expect(await getShoppingCategories(owner)).not.toContain("tin"); // the lists are apart

      // A unit an item brings along joins the list; renaming moves the items; deleting files them under "pcs".
      const { item } = succeeded(await addShoppingItemAction({ name: "Beans", unit: "tray" }));
      expect(await getShoppingCategories(owner, "unit")).toContain("tray");
      const renamed = succeeded(await renameShoppingCategoryAction({ kind: "unit", from: "tray", to: "crate" }));
      expect(renamed.change?.itemIds).toEqual([item.id]);
      expect((await getShoppingList(owner)).find((i) => i.id === item.id)?.unit).toBe("crate");

      authState.id = stranger;
      expect((await renameShoppingCategoryAction({ kind: "unit", from: "crate", to: "mine" })).success).toBe(false);
      expect((await deleteShoppingCategoryAction({ kind: "unit", name: "crate" })).success).toBe(false);
      expect((await getShoppingList(owner)).find((i) => i.id === item.id)?.unit).toBe("crate");

      authState.id = owner;
      const removed = succeeded(await deleteShoppingCategoryAction({ kind: "unit", name: "crate" }));
      expect((await getShoppingList(owner)).find((i) => i.id === item.id)?.unit).toBe("pcs");
      expect(await getShoppingCategories(owner, "unit")).not.toContain("crate");

      // Undo puts the unit back with exactly its items, owner only.
      const undo = { kind: "unit" as const, name: "crate", current: "pcs", ...removed.change!, dropCurrent: false };
      authState.id = stranger;
      await revertShoppingCategoryAction(undo);
      expect((await getShoppingList(owner)).find((i) => i.id === item.id)?.unit).toBe("pcs");
      authState.id = owner;
      await revertShoppingCategoryAction(undo);
      expect((await getShoppingList(owner)).find((i) => i.id === item.id)?.unit).toBe("crate");
      expect(await getShoppingCategories(owner, "unit")).toContain("crate");
      authState.id = "";
    });

    it("undoes a category delete and rename with exactly the moved items, for the owner only", async () => {
      const owner = await seedUser(`revert-${randomUUID()}`);
      const stranger = await seedUser(`revert-${randomUUID()}`);
      authState.id = owner;
      const { item: milk } = succeeded(await addShoppingItemAction({ name: "Milk", category: "dairy" }));
      const { item: loose } = succeeded(await addShoppingItemAction({ name: "Tape", category: "other" }));

      const removed = succeeded(await deleteShoppingCategoryAction({ name: "dairy" }));
      expect(removed.change?.itemIds).toEqual([milk.id]);
      const undoDelete = { name: "dairy", current: "other", ...removed.change!, dropCurrent: false };

      authState.id = stranger;
      await revertShoppingCategoryAction(undoDelete);
      expect(await getShoppingCategories(stranger)).toContain("dairy"); // its own list only
      expect((await getShoppingList(owner)).find((i) => i.id === milk.id)?.category).toBe("other");

      authState.id = owner;
      await revertShoppingCategoryAction(undoDelete);
      const list = await getShoppingList(owner);
      expect(list.find((i) => i.id === milk.id)?.category).toBe("dairy");
      expect(list.find((i) => i.id === loose.id)?.category).toBe("other");
      expect(await getShoppingCategories(owner)).toContain("dairy");

      const renamed = succeeded(await renameShoppingCategoryAction({ from: "dairy", to: "fridge" }));
      await revertShoppingCategoryAction({ name: "dairy", current: "fridge", ...renamed.change!, dropCurrent: !renamed.change!.merged });
      expect((await getShoppingList(owner)).find((i) => i.id === milk.id)?.category).toBe("dairy");
      expect(await getShoppingCategories(owner)).not.toContain("fridge");
      authState.id = "";
    });

    it("executes food server actions for authenticated owner", async () => {
      authState.id = userA;
      const today = toISODate();

      // 1. Log meal
      const mealRes = succeeded(await logMealAction({
        date: today,
        name: "Whey Shake",
        calories: 200,
        protein: 30,
        carbs: 5,
        fat: 3,
      }));
      expect(mealRes.success).toBe(true);
      expect(mealRes.meal?.name).toBe("Whey Shake");

      // 2. Water: a tap sends the total it showed and the new one, so a repeat of the same tap no longer matches and
      // changes nothing.
      const waterRes = succeeded(await setWaterAction({ date: today, waterMl: { from: 0, to: 500 } }));
      expect(waterRes.metrics?.waterMl).toBe(500);
      expect(waterRes.targets).toBeNull(); // the goal was not sent, so it was not written
      expect(await setWaterAction({ date: today, waterMl: { from: 0, to: 500 } })).toEqual({ success: false, error: CHANGED_ELSEWHERE });
      expect((await getDailyFoodSummary(userA, today)).metrics.waterMl).toBe(500);
      // A bare total (no value it showed) is not a valid change.
      await expect(setWaterAction({ date: today, waterMl: 750 })).resolves.toMatchObject({ success: false });

      // A day never holds more than the limit, nor less than 0.
      expect(succeeded(await setWaterAction({ date: today, waterMl: { from: 500, to: MAX_WATER_ML } })).metrics?.waterMl).toBe(MAX_WATER_ML);
      await expect(setWaterAction({ date: today, waterMl: { from: MAX_WATER_ML, to: MAX_WATER_ML + 1 } })).resolves.toMatchObject({ success: false });
      await expect(setWaterAction({ date: today, waterMl: { from: MAX_WATER_ML, to: -1 } })).resolves.toMatchObject({ success: false });
      await expect(setWaterAction({ date: today })).resolves.toEqual({ success: false, error: "Nothing to save." });

      // The steps log and the steps goal share one limit.
      expect(succeeded(await updateStepsAction({ date: today, steps: { from: 0, to: 150000 } })).metrics?.steps).toBe(150000);
      await expect(updateStepsAction({ date: today, steps: { from: 150000, to: 200001 } })).resolves.toMatchObject({ success: false });

      // An impossible day and a malformed id are validation errors, not database errors.
      await expect(setWaterAction({ date: "2026-13-45", waterMl: { from: 0, to: 250 } })).resolves.toMatchObject({ success: false });
      await expect(updateStepsAction({ date: "2026-02-30", steps: { from: 0, to: 1000 } })).resolves.toMatchObject({ success: false });

      // 3. Update steps
      const stepsRes = succeeded(await updateStepsAction({ date: today, steps: { from: 150000, to: 10500 } }));
      expect(stepsRes.success).toBe(true);
      expect(stepsRes.metrics?.steps).toBe(10500);

      // 4. Update targets
      const targetRes = succeeded(await updateTargetsAction({
        calories: { from: 3350, to: 3400 },
        proteinGrams: { from: 170, to: 175 },
        carbsGrams: { from: 300, to: 310 },
      }));
      expect(targetRes.success).toBe(true);
      expect(targetRes.targets.calories).toBe(3400);

      // 5. Shopping: add, edit, rename, clear and undo
      const { item } = succeeded(await addShoppingItemAction({ name: "Eggs", amount: 6, category: "Dairy" }));
      expect(item.category).toBe("dairy");
      const editRes = await updateShoppingItemAction({ itemId: item.id, name: "Eggs", amount: 10, unit: "pcs", category: "dairy" });
      expect(editRes.success && Number(editRes.item.amount)).toBe(10);
      expect((await renameShoppingCategoryAction({ from: "dairy", to: "fridge" })).success).toBe(true);
      await expect(updateShoppingItemAction({ itemId: item.id, name: "", amount: 1, unit: "pcs", category: "x" })).resolves.toMatchObject({ success: false });
      await expect(updateShoppingItemAction({ itemId: item.id, name: "Eggs", amount: 1, unit: "  ", category: "x" })).resolves.toMatchObject({ success: false });

      // Renaming onto another item with the same name and unit is refused as data (any case), not merged.
      const { item: milk } = succeeded(await addShoppingItemAction({ name: "Milk", amount: 1, unit: "l", category: "dairy" }));
      expect(await updateShoppingItemAction({ itemId: milk.id, name: "EGGS", amount: 1, unit: "PCS", category: "dairy" })).toMatchObject({ success: false });
      expect(await updateShoppingItemAction({ itemId: milk.id, name: "EGGS", amount: 1, unit: "l", category: "dairy" })).toMatchObject({ success: true });

      // 6. Toggle, clear bought items and undo
      await toggleShoppingItemAction(item.id, true);
      const clearRes = succeeded(await clearBoughtItemsAction({ itemIds: [item.id] }));
      expect(clearRes.deletedCount).toBe(1);
      expect(succeeded(await restoreShoppingItemsAction({ itemIds: [item.id] })).items).toHaveLength(1);

      // Another user cannot edit or restore it.
      authState.id = userB;
      await expect(
        updateShoppingItemAction({ itemId: item.id, name: "Mine", amount: 1, unit: "pcs", category: "other" }),
      ).resolves.toMatchObject({ success: false });
      await expect(restoreShoppingItemsAction({ itemIds: [item.id] })).resolves.toEqual({ success: false, error: "Item not found." });
      expect(succeeded(await clearBoughtItemsAction({ itemIds: [item.id] })).deletedCount).toBe(0);
      await expect(toggleShoppingItemAction(item.id, true)).resolves.toEqual({ success: false, error: "Item not found." });
      await expect(deleteShoppingItemAction(item.id)).resolves.toEqual({ success: false, error: "Item not found." });
      expect((await renameShoppingCategoryAction({ from: "fridge", to: "x" })).success).toBe(false);
      authState.id = userA;

      // 7. Delete meal
      const delMealRes = await deleteMealAction(mealRes.meal!.id);
      expect(delMealRes.success).toBe(true);
    });

    it("saves goals for the signed-in owner only and validates their ranges", async () => {
      // Each goal from the default the screen showed (a user with no goals row yet holds the defaults).
      const goals = {
        calories: { from: 3350, to: 3000 },
        proteinGrams: { from: 170, to: 160 },
        carbsGrams: { from: 300, to: 280 },
        fatGrams: { from: 80, to: 70 },
        waterMl: { from: 3000, to: 3500 },
        steps: { from: 10000, to: 12000 },
      };
      authState.id = "";
      expect(await updateTargetsAction(goals)).toEqual({ success: false, error: SIGNED_OUT });

      authState.id = userA;
      expect(succeeded(await updateTargetsAction(goals)).targets.steps).toBe(12000);
      await expect(updateTargetsAction({ waterMl: { from: 3500, to: 100 } })).resolves.toMatchObject({ success: false });

      // Another user's save writes their own row: the owner's goals stay as they were.
      authState.id = userB;
      succeeded(await updateTargetsAction({ ...goals, calories: { from: 3350, to: 2000 } }));
      expect((await getNutritionTargets(userA)).calories).toBe(3000);
      expect((await getNutritionTargets(userB)).calories).toBe(2000);
    });

    it("writes meals for today and yesterday only", async () => {
      authState.id = userA;
      const today = toISODate();
      const locked = "Only today and yesterday can be changed.";
      const meal = { name: "Oats", calories: 100, protein: 1, carbs: 1, fat: 1 };
      for (const date of [addDays(today, -2), addDays(today, 1)]) {
        await expect(logMealAction({ ...meal, date })).resolves.toEqual({ success: false, error: locked });
      }
      expect((await logMealAction({ ...meal, date: addDays(today, -1) })).success).toBe(true); // yesterday is the grace day
    });

    describe("water, steps and weight are saved for today only (Bucharest), with a fixed clock", () => {
      afterEach(() => vi.useRealTimers());
      const at = (instant: string) => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date(instant));
      };
      const onlyToday = { success: false, error: "Only today can be changed." };
      const saves = (date: string) => [
        setWaterAction({ date, waterMl: { from: 0, to: 250 } }),
        updateStepsAction({ date, steps: { from: 0, to: 5000 } }),
        saveWeightAction({ id: randomUUID(), date, kilograms: 80 }),
      ];
      const written = async () => {
        const { rows } = await admin.query(
          "SELECT (SELECT count(*) FROM daily_metrics WHERE user_id = $1) + (SELECT count(*) FROM weight_entries WHERE user_id = $1) AS n",
          [userA],
        );
        return Number(rows[0].n);
      };

      it("refuses yesterday and tomorrow, accepts today", async () => {
        authState.id = userA;
        at("2026-11-20T10:00:00Z"); // 12:00 in Bucharest
        for (const answer of await Promise.all(saves("2026-11-19"))) expect(answer).toEqual(onlyToday);
        // Tomorrow: the weigh-in's own rule (no future day) may answer first; water and steps get the today rule.
        for (const answer of await Promise.all(saves("2026-11-21"))) expect(answer).toMatchObject({ success: false });
        expect(await written()).toBe(0);
        for (const answer of await Promise.all(saves("2026-11-20"))) expect(answer).toMatchObject({ success: true });
        expect(await written()).toBe(2); // one metrics row (water and steps) and one weigh-in
      });

      it("moves to the new day at Bucharest midnight, not UTC", async () => {
        authState.id = userA;
        at("2026-11-20T21:59:59Z"); // 23:59:59 in Bucharest, still the 20th
        expect(await setWaterAction({ date: "2026-11-21", waterMl: { from: 0, to: 250 } })).toEqual(onlyToday);
        expect((await setWaterAction({ date: "2026-11-20", waterMl: { from: 0, to: 250 } })).success).toBe(true);
        at("2026-11-20T22:00:00Z"); // 00:00 in Bucharest: the 21st, though UTC still says the 20th
        for (const answer of await Promise.all(saves("2026-11-20"))) expect(answer).toEqual(onlyToday);
        for (const answer of await Promise.all(saves("2026-11-21"))) expect(answer).toMatchObject({ success: true });
      });

      it("still deletes a past weigh-in, and its Undo puts it back", async () => {
        authState.id = userA;
        const today = toISODate();
        const [past] = await db
          .insert(weightEntries)
          .values({ userId: userA, date: addDays(today, -3), kilograms: "81.20" })
          .returning();
        expect((await deleteWeightAction(past.id)).success).toBe(true);
        expect(await listWeightEntries(userA)).toEqual([]);
        const back = succeeded(await restoreWeightAction({ id: past.id, date: past.date, kilograms: 81.2 }));
        expect(back.entry?.id).toBe(past.id);
        expect((await listWeightEntries(userA)).map((w) => w.date)).toEqual([past.date]);
      });
    });

    it("writes the steps and their goal together or not at all", async () => {
      authState.id = userA;
      const today = toISODate();
      // A valid amount with a goal out of range: refused, and neither is written.
      const steps = { from: 0, to: 5000 };
      expect((await updateStepsAction({ date: today, steps, goal: { from: 10000, to: 10 } })).success).toBe(false);
      expect(await getDailyMetricsHistory(userA, today)).toEqual([]);
      expect((await getNutritionTargets(userA)).steps).toBe(10000);
      // A failure of the goal's write in the database takes the amount back with it (one transaction).
      await expect(updateDailySteps(userA, today, steps, { from: 10000, to: 2 ** 31 })).rejects.toThrow();
      expect(await getDailyMetricsHistory(userA, today)).toEqual([]);
      // Both valid: both are written.
      const both = succeeded(await updateStepsAction({ date: today, steps, goal: { from: 10000, to: 12000 } }));
      expect([both.metrics?.steps, both.targets?.steps]).toEqual([5000, 12000]);
    });

    it("writes only the fields an edit sends, so two edits of one row both stay", async () => {
      authState.id = userA;
      const today = toISODate();
      // Two partial goal edits from the same screen (say, from two devices): each writes its own column only.
      succeeded(await updateTargetsAction({ calories: { from: 3350, to: 2800 } }));
      succeeded(await updateTargetsAction({ proteinGrams: { from: 170, to: 190 } }));
      expect(await getNutritionTargets(userA)).toMatchObject({ calories: 2800, proteinGrams: 190, carbsGrams: 300, waterMl: 3000, steps: 10000 });
      await expect(updateTargetsAction({})).resolves.toEqual({ success: false, error: "Nothing to save." });

      // The day's water and its goal, each edited alone, leave the other one as it was.
      expect(succeeded(await setWaterAction({ date: today, waterMl: { from: 0, to: 750 } })).targets).toBeNull();
      expect(succeeded(await setWaterAction({ date: today, goal: { from: 3000, to: 4000 } })).metrics).toBeNull();
      expect((await getDailyFoodSummary(userA, today)).metrics.waterMl).toBe(750);
      expect((await getNutritionTargets(userA)).waterMl).toBe(4000);
      // The steps of the same row are not touched by a water edit.
      succeeded(await updateStepsAction({ date: today, steps: { from: 0, to: 3000 } }));
      succeeded(await setWaterAction({ date: today, waterMl: { from: 750, to: 1000 } }));
      expect((await getDailyFoodSummary(userA, today)).metrics).toMatchObject({ waterMl: 1000, steps: 3000 });
    });

    it("refuses a water, steps or goal change from a screen that shows an old value, and writes nothing", async () => {
      authState.id = userA;
      const today = toISODate();
      const refused = { success: false, error: CHANGED_ELSEWHERE };
      const day = async () => (await getDailyFoodSummary(userA, today)).metrics;

      // Water: device A adds to an empty day; device B, still showing 0, adds too and is refused. A's total stays.
      succeeded(await setWaterAction({ date: today, waterMl: { from: 0, to: 250 } }));
      expect(await setWaterAction({ date: today, waterMl: { from: 0, to: 500 } })).toEqual(refused);
      expect((await day()).waterMl).toBe(250);
      // From the value stored, it saves.
      expect(succeeded(await setWaterAction({ date: today, waterMl: { from: 250, to: 750 } })).metrics?.waterMl).toBe(750);
      // An Undo sends back from the value its change wrote: after another device changed it, the Undo is refused too.
      succeeded(await setWaterAction({ date: today, waterMl: { from: 750, to: 1250 } })); // the other device, after a refresh
      expect(await setWaterAction({ date: today, waterMl: { from: 750, to: 250 } })).toEqual(refused); // Undo of the add to 750
      expect((await day()).waterMl).toBe(1250);
      expect(succeeded(await setWaterAction({ date: today, waterMl: { from: 1250, to: 750 } })).metrics?.waterMl).toBe(750);

      // Steps: a stale amount refuses the whole save, its goal too (both or neither), and so does a stale goal.
      succeeded(await updateStepsAction({ date: today, steps: { from: 0, to: 4000 } }));
      expect(await updateStepsAction({ date: today, steps: { from: 0, to: 6000 }, goal: { from: 10000, to: 12000 } })).toEqual(refused);
      expect(await updateStepsAction({ date: today, steps: { from: 4000, to: 6000 }, goal: { from: 9000, to: 12000 } })).toEqual(refused);
      expect((await day()).steps).toBe(4000);
      expect((await getNutritionTargets(userA)).steps).toBe(10000);
      const both = succeeded(await updateStepsAction({ date: today, steps: { from: 4000, to: 6000 }, goal: { from: 10000, to: 12000 } }));
      expect([both.metrics?.steps, both.targets?.steps]).toEqual([6000, 12000]);

      // Goals: device A changes calories; device B, still showing the old calories, changes them too and is refused,
      // with its protein in the same save; B's edit of protein alone still saves (the edits touch different goals).
      succeeded(await updateTargetsAction({ calories: { from: 3350, to: 2800 } }));
      expect(await updateTargetsAction({ calories: { from: 3350, to: 3000 } })).toEqual(refused);
      expect(await updateTargetsAction({ calories: { from: 3350, to: 3000 }, proteinGrams: { from: 170, to: 190 } })).toEqual(refused);
      expect(await getNutritionTargets(userA)).toMatchObject({ calories: 2800, proteinGrams: 170 });
      succeeded(await updateTargetsAction({ proteinGrams: { from: 170, to: 190 } }));
      expect(await getNutritionTargets(userA)).toMatchObject({ calories: 2800, proteinGrams: 190 });
      // The water goal from the water dialog is checked the same way.
      expect(await setWaterAction({ date: today, goal: { from: 2500, to: 4000 } })).toEqual(refused);
      expect((await getNutritionTargets(userA)).waterMl).toBe(3000);
    });

    it("rejects a name that is only spaces instead of storing an empty one", async () => {
      authState.id = userA;
      const today = toISODate();
      await expect(
        logMealAction({ date: today, name: "   ", calories: 1, protein: 0, carbs: 0, fat: 0 }),
      ).resolves.toMatchObject({ success: false });
      expect(succeeded(await logMealAction({ date: today, name: "  Rice  ", calories: 1, protein: 0, carbs: 0, fat: 0 })).meal?.name).toBe("Rice");
    });

    it("keeps only the last 7 days of water and steps, per owner", async () => {
      const today = toISODate();
      // Days older than the window are already there (as before the cleanup); writing today drops them, and only for the writer.
      const rows = [-9, -7, -6, -3, 0].map((d) => ({ date: addDays(today, d), waterMl: 100, steps: 100 }));
      await db.insert(dailyMetrics).values(rows.map((r) => ({ ...r, userId: userA })));
      await db.insert(dailyMetrics).values({ userId: userB, date: addDays(today, -9), waterMl: 5, steps: 5 });

      authState.id = userA;
      succeeded(await setWaterAction({ date: today, waterMl: { from: 100, to: 250 } }));
      expect((await getDailyMetricsHistory(userA, today)).map((r) => r.date)).toEqual([today, addDays(today, -3), addDays(today, -6)]);
      expect(await db.select().from(dailyMetrics).where(eq(dailyMetrics.userId, userA))).toHaveLength(3); // pruned in the table, not just hidden
      expect(await db.select().from(dailyMetrics).where(eq(dailyMetrics.userId, userB))).toHaveLength(1);
      expect(await getDailyMetricsHistory(userB, today)).toEqual([]);

      await db.insert(dailyMetrics).values({ userId: userA, date: addDays(today, -8), waterMl: 1, steps: 1 });
      succeeded(await updateStepsAction({ date: today, steps: { from: 100, to: 7000 } }));
      expect(await db.select().from(dailyMetrics).where(eq(dailyMetrics.userId, userA))).toHaveLength(3);
    });

    it("keeps every weigh-in forever, and a page read can be bounded", async () => {
      const today = toISODate();
      await db.insert(weightEntries).values([
        { userId: userA, date: addDays(today, -400), kilograms: "81.00" },
        { userId: userA, date: addDays(today, -364), kilograms: "80.00" },
        { userId: userB, date: addDays(today, -400), kilograms: "70.00" },
      ]);
      await saveWeightEntry(userA, { date: today, kilograms: 79.5 });
      await db.insert(weightEntries).values({ userId: userA, date: addDays(today, -500), kilograms: "90.00" });
      await saveWeightEntry(userA, { date: today, kilograms: 79.4 });
      expect(await db.select().from(weightEntries).where(eq(weightEntries.userId, userA))).toHaveLength(4);
      expect(await db.select().from(weightEntries).where(eq(weightEntries.userId, userB))).toHaveLength(1);
      expect((await listWeightEntries(userA)).map((w) => w.date)).toEqual([today, addDays(today, -364), addDays(today, -400), addDays(today, -500)]);
      expect((await listWeightEntries(userA, addDays(today, -364))).map((w) => w.date)).toEqual([today, addDays(today, -364)]);
    });

    it("turns two simultaneous saves of a new day into one create and one edit", async () => {
      const today = toISODate();
      const results = await Promise.all([
        saveWeightEntry(userA, { date: today, kilograms: 80 }),
        saveWeightEntry(userA, { date: today, kilograms: 81 }),
      ]);
      expect(results.filter((r) => r.previous === null)).toHaveLength(1);
      expect(await db.select().from(weightEntries).where(eq(weightEntries.userId, userA))).toHaveLength(1);
    });

    it("adds a meal or a weigh-in once when the same add (same id) is sent again", async () => {
      authState.id = userA;
      const today = toISODate();
      const meal = { id: randomUUID(), date: today, name: "Oats", calories: 300, protein: 10, carbs: 50, fat: 5 };
      const first = succeeded(await logMealAction(meal));
      const again = succeeded(await logMealAction(meal)); // the answer was lost, the device sends it again
      expect(again.meal?.id).toBe(first.meal?.id);
      expect((await getDailyFoodSummary(userA, today)).meals).toHaveLength(1);

      const weigh = { id: randomUUID(), date: today, kilograms: 80.5 };
      const added = succeeded(await saveWeightAction(weigh));
      const repeat = succeeded(await saveWeightAction(weigh));
      expect([added.previous, repeat.previous]).toEqual([null, null]); // the repeat is still the add, not an edit of it
      expect(repeat.entry?.id).toBe(weigh.id);
      expect(await listWeightEntries(userA)).toHaveLength(1);
    });

    it("never lets an id another user owns change, add or show anything", async () => {
      const today = toISODate();
      authState.id = userB;
      const theirs = succeeded(await logMealAction({ id: randomUUID(), date: today, name: "Theirs", calories: 500, protein: 0, carbs: 0, fat: 0 }));
      const theirWeight = succeeded(await saveWeightAction({ id: randomUUID(), date: today, kilograms: 70 }));

      authState.id = userA;
      // Refused with a reason that names nothing of theirs.
      expect(await logMealAction({ id: theirs.meal!.id, date: today, name: "Mine", calories: 100, protein: 0, carbs: 0, fat: 0 })).toEqual({
        success: false,
        error: "This meal could not be saved.",
      });
      expect(await saveWeightAction({ id: theirWeight.entry.id, date: today, kilograms: 90 })).toEqual({
        success: false,
        error: "This weight could not be saved.",
      });

      expect((await getDailyFoodSummary(userA, today)).meals).toEqual([]);
      expect(await listWeightEntries(userA)).toEqual([]);
      expect((await getDailyFoodSummary(userB, today)).meals.map((m) => [m.name, m.calories])).toEqual([["Theirs", 500]]);
      expect((await listWeightEntries(userB)).map((w) => w.kilograms)).toEqual(["70.00"]);
    });

    it("counts a meal as empty when every value rounds to 0, on the form and on the server alike", async () => {
      expect(mealHasValue({ calories: 0, protein: 0.04, carbs: 0, fat: 0 })).toBe(false); // shows as 0,0 g
      expect(mealHasValue({ calories: 0, protein: 0.05, carbs: 0, fat: 0 })).toBe(true); // shows as 0,1 g
      expect(mealHasValue({ calories: 1, protein: 0, carbs: 0, fat: 0 })).toBe(true);
      authState.id = userA;
      const empty = { date: toISODate(), name: "Meal", calories: 0, protein: 0.04, carbs: 0.04, fat: 0 };
      expect(await logMealAction(empty)).toEqual({ success: false, error: "Enter calories or a macro above 0." });
      expect((await getDailyFoodSummary(userA, toISODate())).meals).toEqual([]);
    });
  });
});
