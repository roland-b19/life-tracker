import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  id: "",
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super("Authentication required.");
      this.name = "UnauthorizedError";
    }
  },
}));

vi.mock("@/server/auth", () => ({
  UnauthorizedError: authState.UnauthorizedError,
  requireUser: vi.fn(async () => {
    if (!authState.id) throw new authState.UnauthorizedError();
    return authState.id;
  }),
}));

import { db } from "@/server/db";
import { addDays, toISODate } from "@/lib/format-date";
import { eq } from "drizzle-orm";
import { dailyMetrics, users, weightEntries } from "@/db/schema";
import { createWeightEntry, updateWeightEntry } from "@/server/weight";
import {
  addShoppingItem,
  addWater,
  deleteMeal,
  getDailyFoodSummary,
  getNutritionTargets,
  clearBoughtShoppingItems,
  getShoppingCategories,
  getShoppingList,
  getDailyMetricsHistory,
  getPastFoods,
  logMeal,
  renameShoppingCategory,
  reorderShoppingCategories,
  restoreShoppingItems,
  toggleShoppingItem,
  updateDailySteps,
  updateNutritionTargets,
  updateShoppingItem,
} from "@/lib/food";
import {
  addWaterAction,
  clearBoughtItemsAction,
  addShoppingCategoryAction,
  addShoppingItemAction,
  deleteMealAction,
  deleteShoppingItemAction,
  deleteShoppingCategoryAction,
  logMealAction,
  renameShoppingCategoryAction,
  reorderShoppingCategoriesAction,
  restoreShoppingItemsAction,
  revertShoppingCategoryAction,
  updateShoppingItemAction,
  toggleShoppingItemAction,
  updateStepsAction,
  updateTargetsAction,
} from "@/app/actions/food";

const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

async function seedUser(subject: string) {
  const [user] = await db
    .insert(users)
    .values({ issuer: "test", subject })
    .returning({ id: users.id });
  return user.id;
}

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
      calories: 3500,
      proteinGrams: 180,
      carbsGrams: 320,
      fatGrams: 85,
      waterMl: 3500,
      steps: 12000,
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
    await addWater(userA, today, 500);
    await updateDailySteps(userA, today, 8500);

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
    const meal = await logMeal(userA, {
      date: "2026-11-04",
      name: "Salmon",
      calories: 500,
      protein: 40,
      carbs: 10,
      fat: 25,
    });

    // User B tries to delete User A's meal -> fails / returns undefined
    const deletedByB = await deleteMeal(userB, meal.id);
    expect(deletedByB).toBeUndefined();

    // User A can delete their own meal
    const deletedByA = await deleteMeal(userA, meal.id);
    expect(deletedByA?.id).toBe(meal.id);
  });

  it("lists past foods newest first, one per name, up to the limit", async () => {
    for (let i = 0; i < 5; i++) await logMeal(userA, { date: "2026-10-31", name: `Food ${i}`, calories: 100, protein: 1, carbs: 1, fat: 1 });
    await logMeal(userA, { date: "2026-10-31", name: "FOOD 0", calories: 250, protein: 1, carbs: 1, fat: 1 }); // same name, other case, logged last
    const foods = await getPastFoods(userA, 3);
    expect(foods.map((f) => f.name.toLowerCase())).toEqual(["food 0", "food 4", "food 3"]);
    expect(foods[0].calories).toBe(250);
  });

  it("deletes a shopping item softly, and Undo brings it back exactly, bought state included", async () => {
    authState.id = userA;
    const item = await addShoppingItem(userA, { name: "Milk", amount: 2, unit: "l", category: "dairy" });
    await toggleShoppingItem(userA, item.id, true);
    const [before] = (await getShoppingList(userA)).filter((i) => i.id === item.id);
    expect((await deleteShoppingItemAction(item.id)).success).toBe(true);
    expect(await getShoppingList(userA)).toHaveLength(0);
    authState.id = userB;
    expect((await restoreShoppingItemsAction({ itemIds: [item.id] })).items ?? []).toHaveLength(0);
    authState.id = userA;
    await restoreShoppingItemsAction({ itemIds: [item.id] });
    expect((await getShoppingList(userA))[0]).toEqual(before);
    // "Add again" onto a bought item starts it over; Undo puts amount, bought flag and time back.
    const again = await addShoppingItem(userA, { name: "Milk", amount: 1, unit: "l", category: "dairy" });
    expect(again.isBought).toBe(false);
    await updateShoppingItem(userA, { itemId: item.id, name: before.name, amount: Number(before.amount), unit: before.unit, category: before.category, isBought: before.isBought, checkedAt: before.checkedAt });
    expect((await getShoppingList(userA))[0]).toEqual(before);
    authState.id = "";
    await expect(deleteShoppingItemAction(item.id)).rejects.toThrow("Authentication required.");
  });

  it("ticks and deletes a shopping item for the owner only", async () => {
    const item = await addShoppingItem(userA, { name: "Bread", amount: 1, unit: "pcs", category: "pantry" });
    const bought = async () => (await getShoppingList(userA)).find((i) => i.id === item.id)?.isBought;
    authState.id = userB;
    await toggleShoppingItemAction(item.id, true);
    await deleteShoppingItemAction(item.id);
    authState.id = "";
    await expect(toggleShoppingItemAction(item.id, true)).rejects.toThrow("Authentication required.");
    await expect(deleteShoppingItemAction(item.id)).rejects.toThrow("Authentication required.");
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
    const cleared = await clearBoughtShoppingItems(userA);
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
    it("rejects unauthenticated requests", async () => {
      authState.id = "";
      await expect(
        logMealAction({
          date: "2026-11-04",
          name: "Test",
          calories: 100,
          protein: 10,
          carbs: 10,
          fat: 2,
        }),
      ).rejects.toThrow("Authentication required.");

      const itemId = randomUUID();
      await expect(addShoppingItemAction({ name: "Eggs" })).rejects.toThrow("Authentication required.");
      await expect(
        updateShoppingItemAction({ itemId, name: "Eggs", amount: 1, unit: "pcs", category: "dairy" }),
      ).rejects.toThrow("Authentication required.");
      await expect(renameShoppingCategoryAction({ from: "dairy", to: "fridge" })).rejects.toThrow(
        "Authentication required.",
      );
      await expect(restoreShoppingItemsAction({ itemIds: [itemId] })).rejects.toThrow("Authentication required.");
      await expect(reorderShoppingCategoriesAction({ names: ["dairy"] })).rejects.toThrow("Authentication required.");
      await expect(addShoppingCategoryAction({ name: "frozen" })).rejects.toThrow("Authentication required.");
      await expect(deleteShoppingCategoryAction({ name: "dairy" })).rejects.toThrow("Authentication required.");
      await expect(
        revertShoppingCategoryAction({ name: "dairy", current: "other", sortOrder: 1, itemIds: [itemId], dropCurrent: false }),
      ).rejects.toThrow("Authentication required.");
      // The same actions on the unit list.
      await expect(addShoppingCategoryAction({ kind: "unit", name: "tin" })).rejects.toThrow("Authentication required.");
      await expect(renameShoppingCategoryAction({ kind: "unit", from: "kg", to: "kilo" })).rejects.toThrow("Authentication required.");
      await expect(deleteShoppingCategoryAction({ kind: "unit", name: "kg" })).rejects.toThrow("Authentication required.");
      await expect(reorderShoppingCategoriesAction({ kind: "unit", names: ["kg"] })).rejects.toThrow("Authentication required.");
      await expect(
        revertShoppingCategoryAction({ kind: "unit", name: "kg", current: "pcs", sortOrder: 1, itemIds: [itemId], dropCurrent: false }),
      ).rejects.toThrow("Authentication required.");

      await expect(addWaterAction("2026-11-04", 250)).rejects.toThrow(
        "Authentication required.",
      );
      await expect(updateStepsAction("2026-11-04", 5000)).rejects.toThrow(
        "Authentication required.",
      );
    });

    it("manages shopping categories, owner only, with \"other\" as the fixed fallback", async () => {
      const owner = await seedUser(`categories-${randomUUID()}`);
      const stranger = await seedUser(`categories-${randomUUID()}`);
      expect(await getShoppingCategories(owner)).toEqual(["meat", "produce", "dairy", "bakery", "pantry"]);

      authState.id = owner;
      expect((await addShoppingCategoryAction({ name: " Frozen " })).success).toBe(true);
      expect((await addShoppingCategoryAction({ name: "frozen" })).success).toBe(false);
      await expect(addShoppingCategoryAction({ name: "Other" })).rejects.toThrow();
      await expect(renameShoppingCategoryAction({ from: "frozen", to: "other" })).rejects.toThrow();
      expect((await getShoppingCategories(owner)).at(-1)).toBe("frozen");

      // A category an item brings along (for example from the assistant) joins the list.
      const { item } = await addShoppingItemAction({ name: "Peas", category: "freezer" });
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
      await expect(addShoppingCategoryAction({ kind: "unit", name: "pcs" })).rejects.toThrow();
      await expect(addShoppingCategoryAction({ kind: "unit", name: "x".repeat(31) })).rejects.toThrow();
      await expect(renameShoppingCategoryAction({ kind: "unit", from: "tin", to: "pcs" })).rejects.toThrow();
      // "other" is a category fallback only; a unit may use it.
      expect((await addShoppingCategoryAction({ kind: "unit", name: "other" })).success).toBe(true);
      expect(await getShoppingCategories(owner)).not.toContain("tin"); // the lists are apart

      // A unit an item brings along joins the list; renaming moves the items; deleting files them under "pcs".
      const { item } = await addShoppingItemAction({ name: "Beans", unit: "tray" });
      expect(await getShoppingCategories(owner, "unit")).toContain("tray");
      const renamed = await renameShoppingCategoryAction({ kind: "unit", from: "tray", to: "crate" });
      expect(renamed.change?.itemIds).toEqual([item.id]);
      expect((await getShoppingList(owner)).find((i) => i.id === item.id)?.unit).toBe("crate");

      authState.id = stranger;
      expect((await renameShoppingCategoryAction({ kind: "unit", from: "crate", to: "mine" })).success).toBe(false);
      expect((await deleteShoppingCategoryAction({ kind: "unit", name: "crate" })).success).toBe(false);
      expect((await getShoppingList(owner)).find((i) => i.id === item.id)?.unit).toBe("crate");

      authState.id = owner;
      const removed = await deleteShoppingCategoryAction({ kind: "unit", name: "crate" });
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
      const { item: milk } = await addShoppingItemAction({ name: "Milk", category: "dairy" });
      const { item: loose } = await addShoppingItemAction({ name: "Tape", category: "other" });

      const removed = await deleteShoppingCategoryAction({ name: "dairy" });
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

      const renamed = await renameShoppingCategoryAction({ from: "dairy", to: "fridge" });
      await revertShoppingCategoryAction({ name: "dairy", current: "fridge", ...renamed.change!, dropCurrent: !renamed.change!.merged });
      expect((await getShoppingList(owner)).find((i) => i.id === milk.id)?.category).toBe("dairy");
      expect(await getShoppingCategories(owner)).not.toContain("fridge");
      authState.id = "";
    });

    it("executes food server actions for authenticated owner", async () => {
      authState.id = userA;
      const today = toISODate();

      // 1. Log meal
      const mealRes = await logMealAction({
        date: today,
        name: "Whey Shake",
        calories: 200,
        protein: 30,
        carbs: 5,
        fat: 3,
      });
      expect(mealRes.success).toBe(true);
      expect(mealRes.meal.name).toBe("Whey Shake");

      // 2. Add water
      const waterRes = await addWaterAction(today, 500);
      expect(waterRes.success).toBe(true);
      expect(waterRes.metrics.waterMl).toBe(500);

      // An impossible day and a malformed id are validation errors, not database errors.
      await expect(addWaterAction("2026-13-45", 250)).rejects.toThrow();
      await expect(updateStepsAction("2026-02-30", 1000)).rejects.toThrow();

      // 3. Update steps
      const stepsRes = await updateStepsAction(today, 10500);
      expect(stepsRes.success).toBe(true);
      expect(stepsRes.metrics.steps).toBe(10500);

      // 4. Update targets
      const targetRes = await updateTargetsAction({
        calories: 3400,
        proteinGrams: 175,
        carbsGrams: 310,
        fatGrams: 80,
        waterMl: 3000,
        steps: 10000,
      });
      expect(targetRes.success).toBe(true);
      expect(targetRes.targets.calories).toBe(3400);

      // 5. Shopping: add, edit, rename, clear and undo
      const { item } = await addShoppingItemAction({ name: "Eggs", amount: 6, category: "Dairy" });
      expect(item.category).toBe("dairy");
      const editRes = await updateShoppingItemAction({ itemId: item.id, name: "Eggs", amount: 10, unit: "pcs", category: "dairy" });
      expect(Number(editRes.item.amount)).toBe(10);
      expect((await renameShoppingCategoryAction({ from: "dairy", to: "fridge" })).success).toBe(true);
      await expect(updateShoppingItemAction({ itemId: item.id, name: "", amount: 1, unit: "pcs", category: "x" })).rejects.toThrow();

      // 6. Toggle, clear bought items and undo
      await toggleShoppingItemAction(item.id, true);
      const clearRes = await clearBoughtItemsAction();
      expect(clearRes.deletedCount).toBe(1);
      expect((await restoreShoppingItemsAction({ itemIds: [item.id] })).items).toHaveLength(1);

      // Another user cannot edit or restore it.
      authState.id = userB;
      await expect(
        updateShoppingItemAction({ itemId: item.id, name: "Mine", amount: 1, unit: "pcs", category: "other" }),
      ).rejects.toThrow("Item not found");
      expect((await restoreShoppingItemsAction({ itemIds: [item.id] })).items).toHaveLength(0);
      expect((await renameShoppingCategoryAction({ from: "fridge", to: "x" })).success).toBe(false);
      authState.id = userA;

      // 7. Delete meal
      const delMealRes = await deleteMealAction(mealRes.meal.id);
      expect(delMealRes.success).toBe(true);
    });

    it("saves goals for the signed-in owner only and validates their ranges", async () => {
      const goals = { calories: 3000, proteinGrams: 160, carbsGrams: 280, fatGrams: 70, waterMl: 3500, steps: 12000 };
      authState.id = "";
      await expect(updateTargetsAction(goals)).rejects.toThrow("Authentication required.");

      authState.id = userA;
      expect((await updateTargetsAction(goals)).targets.steps).toBe(12000);
      await expect(updateTargetsAction({ ...goals, waterMl: 100 })).rejects.toThrow();

      // Another user's save writes their own row: the owner's goals stay as they were.
      authState.id = userB;
      await updateTargetsAction({ ...goals, calories: 2000 });
      expect((await getNutritionTargets(userA)).calories).toBe(3000);
      expect((await getNutritionTargets(userB)).calories).toBe(2000);
    });

    it("refuses to write meals, water or steps outside today and yesterday (the rule the UI already keeps)", async () => {
      authState.id = userA;
      const today = toISODate();
      const locked = "Only today and yesterday can be changed.";
      const meal = { name: "Oats", calories: 100, protein: 1, carbs: 1, fat: 1 };
      for (const date of [addDays(today, -2), addDays(today, 1)]) {
        await expect(logMealAction({ ...meal, date })).rejects.toThrow(locked);
        await expect(addWaterAction(date, 250)).rejects.toThrow(locked);
        await expect(updateStepsAction(date, 5000)).rejects.toThrow(locked);
      }
      expect((await logMealAction({ ...meal, date: addDays(today, -1) })).success).toBe(true); // yesterday is the grace day
      expect((await addWaterAction(today, 250)).metrics.waterMl).toBe(250);
    });

    it("rejects a name that is only spaces instead of storing an empty one", async () => {
      authState.id = userA;
      const today = toISODate();
      await expect(
        logMealAction({ date: today, name: "   ", calories: 1, protein: 0, carbs: 0, fat: 0 }),
      ).rejects.toThrow();
      expect((await logMealAction({ date: today, name: "  Rice  ", calories: 1, protein: 0, carbs: 0, fat: 0 })).meal.name).toBe("Rice");
    });

    it("keeps only the last 7 days of water and steps, per owner", async () => {
      const today = toISODate();
      authState.id = "";
      await expect(addWaterAction(today, 250)).rejects.toThrow("Authentication required.");
      await expect(updateStepsAction(today, 5000)).rejects.toThrow("Authentication required.");

      // Days older than the window are already there (as before the cleanup); writing today drops them, and only for the writer.
      const rows = [-9, -7, -6, -3, 0].map((d) => ({ date: addDays(today, d), waterMl: 100, steps: 100 }));
      await db.insert(dailyMetrics).values(rows.map((r) => ({ ...r, userId: userA })));
      await db.insert(dailyMetrics).values({ userId: userB, date: addDays(today, -9), waterMl: 5, steps: 5 });

      authState.id = userA;
      await addWaterAction(today, 250);
      expect((await getDailyMetricsHistory(userA, today)).map((r) => r.date)).toEqual([today, addDays(today, -3), addDays(today, -6)]);
      expect(await db.select().from(dailyMetrics).where(eq(dailyMetrics.userId, userA))).toHaveLength(3); // pruned in the table, not just hidden
      expect(await db.select().from(dailyMetrics).where(eq(dailyMetrics.userId, userB))).toHaveLength(1);
      expect(await getDailyMetricsHistory(userB, today)).toEqual([]);

      await db.insert(dailyMetrics).values({ userId: userA, date: addDays(today, -8), waterMl: 1, steps: 1 });
      await updateStepsAction(today, 7000);
      expect(await db.select().from(dailyMetrics).where(eq(dailyMetrics.userId, userA))).toHaveLength(3);
    });

    it("keeps only the last 365 days of weigh-ins, per owner", async () => {
      const today = toISODate();
      await db.insert(weightEntries).values([
        { userId: userA, date: addDays(today, -400), kilograms: "81.00" },
        { userId: userA, date: addDays(today, -364), kilograms: "80.00" },
        { userId: userB, date: addDays(today, -400), kilograms: "70.00" },
      ]);
      const created = await createWeightEntry(userA, today, 79.5);
      expect(created.date).toBe(today);
      const kept = await db.select().from(weightEntries).where(eq(weightEntries.userId, userA));
      expect(kept.map((w) => w.date).sort()).toEqual([addDays(today, -364), today]);
      expect(await db.select().from(weightEntries).where(eq(weightEntries.userId, userB))).toHaveLength(1);

      await db.insert(weightEntries).values({ userId: userA, date: addDays(today, -500), kilograms: "90.00" });
      await updateWeightEntry(userA, created.id, today, 79.4);
      expect(await db.select().from(weightEntries).where(eq(weightEntries.userId, userA))).toHaveLength(2);
    });
  });
});
