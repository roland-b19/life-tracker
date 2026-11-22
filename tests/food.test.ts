import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", async () => (await import("./auth")).authModule);
import { authState, seedUser } from "./auth";

import { succeeded } from "./succeeded";
import { SIGNED_OUT } from "@/lib/validations/result";
import { TWO_DECIMALS } from "@/lib/validations/common";
import { buildFoodChatPrompt } from "@/lib/food-ai-chat";
import {
  CHANGED_ELSEWHERE,
  MAX_WATER_ML,
  mealHasValue,
  SHOPPING_ITEM_GONE,
  WEIGHT_ENTRY_GONE,
} from "@/lib/validations/food";
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
  unmergeShoppingItemAction,
  updateShoppingItemAction,
  toggleShoppingItemAction,
  updateStepsAction,
  updateTargetsAction,
} from "@/actions/food";

const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
/** Adds a shopping item and answers the row (new or merged into). */
const addItem = async (...args: Parameters<typeof addShoppingItem>) => (await addShoppingItem(...args)).item;

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

  it("sums a day's macros to one decimal and lists them so in the assistant's prompt [U4]", async () => {
    const today = "2026-11-04";
    for (const [name, protein] of [["A", 0.1], ["B", 0.2], ["C", 33.3], ["D", 33.3], ["E", 33.3]] as const) {
      await logMeal(userA, { date: today, name, calories: 100, protein, carbs: protein, fat: 2.5 });
    }
    expect((await getDailyFoodSummary(userA, today)).totals).toEqual({ calories: 500, protein: 100.2, carbs: 100.2, fat: 12.5 });
    const prompt = await buildFoodChatPrompt(userA, { date: today, time: "12:00" });
    expect(prompt).toContain("totals 500 kcal, P 100.2 g, C 100.2 g, F 12.5 g");
    expect(prompt).toContain("A, 100 kcal, P 0.1 g, C 0.1 g, F 2.5 g");
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
    })).meal!;

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
    await expect(renameShoppingCategoryAction({ from: "snacks", to: " Snacks " })).resolves.toEqual({ success: false, error: "That is already its name" });
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
    const item = await addItem(userA, { name: "Milk", amount: 2, unit: "l", category: "dairy" });
    await toggleShoppingItem(userA, item.id, true);
    const [before] = (await getShoppingList(userA)).filter((i) => i.id === item.id);
    expect((await deleteShoppingItemAction(item.id)).success).toBe(true);
    expect(await getShoppingList(userA)).toHaveLength(0);
    authState.id = userB;
    await expect(restoreShoppingItemsAction({ itemIds: [item.id] })).resolves.toEqual({ success: false, error: "Item not found." });
    authState.id = userA;
    await restoreShoppingItemsAction({ itemIds: [item.id] });
    expect((await getShoppingList(userA))[0]).toEqual(before);
    // "Add again" onto a bought item starts it over; Undo puts the row back as it was: id, amount, bought flag and time.
    const again = succeeded(await addShoppingItemAction({ id: randomUUID(), name: "Milk", amount: 1, unit: "l", category: "dairy" }));
    expect(again.item.isBought).toBe(false);
    expect(again.before).toEqual(before);
    succeeded(await unmergeShoppingItemAction({ itemId: again.item.id, before: { ...before, amount: Number(before.amount) } }));
    expect(await getShoppingList(userA)).toEqual([before]);
    authState.id = "";
    expect(await deleteShoppingItemAction(item.id)).toEqual({ success: false, error: SIGNED_OUT });
  });

  it("ticks and deletes a shopping item for the owner only", async () => {
    const item = await addItem(userA, { name: "Bread", amount: 1, unit: "pcs", category: "pantry" });
    const bought = async () => (await getShoppingList(userA)).find((i) => i.id === item.id)?.isBought;
    authState.id = userB;
    await expect(toggleShoppingItemAction(item.id, true)).resolves.toEqual({ success: false, error: SHOPPING_ITEM_GONE });
    await expect(deleteShoppingItemAction(item.id)).resolves.toEqual({ success: false, error: SHOPPING_ITEM_GONE });
    authState.id = "";
    expect(await toggleShoppingItemAction(item.id, true)).toEqual({ success: false, error: SIGNED_OUT });
    expect(await deleteShoppingItemAction(item.id)).toEqual({ success: false, error: SIGNED_OUT });
    expect(await bought()).toBe(false); // still on A's list, untouched
    authState.id = userA;
    await toggleShoppingItemAction(item.id, true);
    expect(await bought()).toBe(true);
  });

  it("merges the same item, keeps cleared items as history, edits and renames categories", async () => {
    const oil = await addItem(userA, { name: "Olive Oil", amount: 1, unit: "bottle", category: "pantry" });
    // Same name (any case) and unit: one row, amounts added.
    const merged = await addItem(userA, { name: "olive oil", amount: 2, unit: "bottle", category: "other" });
    expect(merged.id).toBe(oil.id);
    expect(Number(merged.amount)).toBe(3);
    // Another unit stays its own row.
    await addItem(userA, { name: "Olive Oil", amount: 500, unit: "ml", category: "pantry" });
    expect(await getShoppingList(userA)).toHaveLength(2);

    // A bought item added again starts over, not bought.
    await toggleShoppingItem(userA, oil.id, true);
    const again = await addItem(userA, { name: "Olive Oil", amount: 1, unit: "bottle", category: "pantry" });
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
    await expect(updateShoppingItem(userB, { itemId: oil.id, name: "X", amount: 1, unit: "pcs", category: "other" })).rejects.toThrow(SHOPPING_ITEM_GONE);
    expect(await renameShoppingCategory(userB, "oils", "x")).toBeNull();
    expect((await restoreShoppingItems(userB, [oil.id])).items).toHaveLength(0);
  });

  it("lists a just-bought item first among the bought and a just-unticked one last among the unbought", async () => {
    const names = async () => (await getShoppingList(userA)).map((i) => i.name);
    const [a, b, c] = [
      await addItem(userA, { name: "Apples", amount: 1, unit: "kg", category: "produce" }),
      await addItem(userA, { name: "Bread", amount: 1, unit: "pcs", category: "produce" }),
      await addItem(userA, { name: "Cheese", amount: 1, unit: "pack", category: "produce" }),
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

  describe("Shopping list (D-042)", () => {
    const list = async (userId = userA) => (await getShoppingList(userId)).map((i) => `${i.name} ${Number(i.amount)} ${i.unit} ${i.category}${i.isBought ? " bought" : ""}`);
    const refused = (error: string) => ({ success: false, error });
    const rowCount = async (userId: string) => Number((await admin.query("SELECT count(*) AS n FROM shopping_items WHERE user_id = $1", [userId])).rows[0].n);
    /** Bought rows made straight in the table: hundreds of adds through the action would only slow the test. */
    const boughtRows = async (userId: string, count: number) =>
      (
        await admin.query(
          "INSERT INTO shopping_items (user_id, name, amount, unit, category, is_bought, checked_at) SELECT $1, 'Item ' || g, 1, 'pcs', 'other', true, now() FROM generate_series(1, $2::int) g RETURNING id",
          [userId, count],
        )
      ).rows.map((r: { id: string }) => r.id);

    it("an add carries the device's id: a repeat is one row; another user's id writes nothing and leaks nothing", async () => {
      const id = randomUUID();
      const first = succeeded(await addShoppingItemAction({ id, name: "Rice", amount: 1, unit: "kg" }));
      const again = succeeded(await addShoppingItemAction({ id, name: "Rice", amount: 1, unit: "kg" }));
      expect(again.item).toEqual(first.item);
      expect(await list()).toEqual(["Rice 1 kg other"]);

      authState.id = userB;
      expect(await addShoppingItemAction({ id, name: "Mine", amount: 5 })).toEqual(refused("This item could not be saved."));
      expect(await rowCount(userB)).toBe(0);
      expect((await getShoppingList(userA))[0]).toEqual(first.item);
      authState.id = "";
      expect(await addShoppingItemAction({ id: randomUUID(), name: "Rice" })).toEqual(refused(SIGNED_OUT));
      expect(await rowCount(userA)).toBe(1);
    });

    it("a merging add takes the add's id, so the same add sent again adds nothing; Undo puts the old row back under its id [D-040]", async () => {
      const { item: old } = succeeded(await addShoppingItemAction({ id: randomUUID(), name: "Eggs", amount: 1, category: "dairy" }));
      const add = { id: randomUUID(), name: "eggs", amount: 1, category: "produce" };
      const merged = succeeded(await addShoppingItemAction(add));
      expect(merged.item).toMatchObject({ id: add.id, name: "Eggs", amount: "2.00", category: "produce", createdAt: old.createdAt });
      expect(merged.before).toEqual(old);
      // The answer was lost and the device sends the same add again: 2, not 3.
      expect(succeeded(await addShoppingItemAction(add))).toMatchObject({ item: { id: add.id, amount: "2.00" }, before: null, repeated: true });
      expect(await list()).toEqual(["Eggs 2 pcs produce"]);
      expect(await rowCount(userA)).toBe(1);

      const undo = { itemId: add.id, before: { ...old, amount: Number(old.amount) } };
      authState.id = userB;
      expect(await unmergeShoppingItemAction(undo)).toEqual(refused(SHOPPING_ITEM_GONE));
      authState.id = "";
      expect(await unmergeShoppingItemAction(undo)).toEqual(refused(SIGNED_OUT));
      expect(await list()).toEqual(["Eggs 2 pcs produce"]);
      authState.id = userA;
      expect(succeeded(await unmergeShoppingItemAction(undo)).item).toEqual(old);
      expect(await getShoppingList(userA)).toEqual([old]);
      expect(await rowCount(userA)).toBe(1);
      expect(await unmergeShoppingItemAction(undo)).toEqual(refused(SHOPPING_ITEM_GONE)); // a second Undo changes nothing
      expect(await getShoppingList(userA)).toEqual([old]);
    });

    it("refuses the Undo of a merge once the item is deleted or renamed, in words, and changes nothing", async () => {
      const { item: old } = succeeded(await addShoppingItemAction({ id: randomUUID(), name: "Tea", amount: 1 }));
      const undoOf = async () => {
        const { item, before } = succeeded(await addShoppingItemAction({ id: randomUUID(), name: "Tea", amount: 1 }));
        return { itemId: item.id, before: { ...before!, amount: Number(before!.amount) } };
      };
      const undo = await undoOf();
      succeeded(await deleteShoppingItemAction(undo.itemId));
      expect(await unmergeShoppingItemAction(undo)).toEqual(refused(SHOPPING_ITEM_GONE));
      expect(await list()).toEqual([]);
      expect((await admin.query("SELECT id FROM shopping_items WHERE id = $1", [old.id])).rows).toEqual([]);

      succeeded(await addShoppingItemAction({ id: randomUUID(), name: "Tea", amount: 1 }));
      const renamed = await undoOf();
      succeeded(await updateShoppingItemAction({ itemId: renamed.itemId, name: "Green tea", amount: 2, unit: "pcs", category: "other" }));
      expect(await unmergeShoppingItemAction(renamed)).toEqual(refused('Can\'t undo: "Green tea" has changed since.'));
      expect(await list()).toEqual(["Green tea 2 pcs other"]);
    });

    it("merges an add into the same item, which takes the new category; past 1.000 it refuses with the amount [HSHOP-12]", async () => {
      const { item } = succeeded(await addShoppingItemAction({ name: "Flour", amount: 2, unit: "kg", category: "pantry" }));
      const merged = succeeded(await addShoppingItemAction({ name: "flour", amount: 1.5, unit: "kg", category: "bakery" }));
      expect(merged.item).toMatchObject({ id: item.id, amount: "3.50", category: "bakery" });
      expect(merged.before).toMatchObject({ id: item.id, amount: "2.00", category: "pantry" });
      expect(succeeded(await addShoppingItemAction({ name: "Salt" })).before).toBeNull();
      expect(await addShoppingItemAction({ name: "Flour", amount: 997, unit: "kg" })).toEqual(refused('"Flour" would be 1.000,5 kg; the most is 1.000.'));
      expect((await list()).sort()).toEqual(["Flour 3.5 kg bakery", "Salt 1 pcs other"]);
      authState.id = userB;
      succeeded(await addShoppingItemAction({ name: "Flour", amount: 1, unit: "kg", category: "mine" }));
      expect((await list()).sort()).toEqual(["Flour 3.5 kg bakery", "Salt 1 pcs other"]); // another user's add is their own row
    });

    it("answers a bad item or name in words, the text sent kept as data [HSHOP-13]", async () => {
      expect(await addShoppingItemAction({ name: "x".repeat(121) })).toEqual(refused("Too long (max 120)"));
      expect(await addShoppingItemAction({ name: "Tea", unit: "u".repeat(31) })).toEqual(refused("Too long (max 30)"));
      expect(await addShoppingItemAction({ name: "Tea", amount: 1.005 })).toEqual(refused(TWO_DECIMALS));
      expect(await addShoppingItemAction({ name: "Tea", amount: 1001 })).toEqual(refused("Must be at most 1000"));
      expect(await addShoppingCategoryAction({ kind: "unit", name: "u".repeat(31) })).toEqual(refused("Too long (max 30)"));
      expect(await addShoppingCategoryAction({ name: "c".repeat(51) })).toEqual(refused("Too long (max 50)"));
      expect(await addShoppingCategoryAction({ name: "Other" })).toEqual(refused('"other" is built in'));
      expect(await addShoppingCategoryAction({ kind: "unit", name: "PCS" })).toEqual(refused('"pcs" is built in'));
      expect(await rowCount(userA)).toBe(0);
    });

    it("an Undo of a delete or a clear merges into the same item added since, which takes its category [HSHOP-04]", async () => {
      const { item: milk } = succeeded(await addShoppingItemAction({ name: "Milk", amount: 1, unit: "l", category: "dairy" }));
      succeeded(await deleteShoppingItemAction(milk.id));
      const { item: again } = succeeded(await addShoppingItemAction({ name: "MILK", amount: 2, unit: "l", category: "bakery" }));
      authState.id = userB;
      expect(await restoreShoppingItemsAction({ itemIds: [milk.id] })).toEqual(refused("Item not found."));
      authState.id = userA;
      const restored = succeeded(await restoreShoppingItemsAction({ itemIds: [milk.id] }));
      expect(restored.merged).toBe(1);
      expect(restored.items.map((i) => i.id)).toEqual([again.id]);
      expect(await list()).toEqual(["MILK 3 l dairy"]);

      // The same after Clear bought, and a sum past the cap refuses the whole Undo.
      succeeded(await toggleShoppingItemAction(again.id, true));
      succeeded(await clearBoughtItemsAction({ itemIds: [again.id] }));
      succeeded(await addShoppingItemAction({ name: "Milk", amount: 999, unit: "l", category: "dairy" }));
      expect(await restoreShoppingItemsAction({ itemIds: [again.id] })).toEqual(refused('"Milk" would be 1.002 l; the most is 1.000.'));
      expect(await list()).toEqual(["Milk 999 l dairy"]);
    });

    it("converts g and kg on a unit change, merges a row already there, and Undo splits it back exactly [HSHOP-04, HSHOP-05]", async () => {
      const add = async (name: string, amount: number, unit: string, category = "pantry") =>
        succeeded(await addShoppingItemAction({ name, amount, unit, category })).item;
      const flourG = await add("Flour", 500, "g");
      const flourKg = await add("Flour", 1, "kg", "bakery");
      const sugar = await add("Sugar", 125, "g");
      const before = await list();

      authState.id = userB;
      expect((await renameShoppingCategoryAction({ kind: "unit", from: "g", to: "kg" })).success).toBe(false);
      expect(await list()).toEqual(before);

      authState.id = userA;
      const { change } = succeeded(await renameShoppingCategoryAction({ kind: "unit", from: "g", to: "kg" }));
      expect(await list()).toEqual(["Flour 1.5 kg pantry", "Sugar 0.13 kg pantry"]);
      expect(change).toMatchObject({ merged: true, merges: [{ id: flourG.id, into: flourKg.id, amount: 1, category: "bakery" }], amounts: [{ id: sugar.id, amount: 125 }] });
      expect(change!.itemIds.sort()).toEqual([flourG.id, flourKg.id, sugar.id].sort());

      const undo = { kind: "unit" as const, name: "g", current: "kg", ...change!, dropCurrent: !change!.merged };
      authState.id = userB;
      expect((await revertShoppingCategoryAction(undo)).success).toBe(false);
      authState.id = "";
      expect(await revertShoppingCategoryAction(undo)).toEqual(refused(SIGNED_OUT));
      expect(await list()).toEqual(["Flour 1.5 kg pantry", "Sugar 0.13 kg pantry"]);
      authState.id = userA;
      succeeded(await revertShoppingCategoryAction(undo));
      expect((await list()).sort()).toEqual(before.sort()); // 125 g, not 130 g
      expect(await getShoppingCategories(userA, "unit")).toEqual(["g", "kg"]); // "g" back in its old place
    });

    it("refuses a unit change it can't add up or convert, and changes nothing [HSHOP-05]", async () => {
      succeeded(await addShoppingItemAction({ name: "Rice", amount: 2, unit: "bag" }));
      succeeded(await addShoppingItemAction({ name: "Rice", amount: 3 }));
      succeeded(await addShoppingItemAction({ name: "Saffron", amount: 2, unit: "g" }));
      succeeded(await addShoppingItemAction({ name: "Oil", amount: 2, unit: "l" }));
      const before = await list();
      expect(await deleteShoppingCategoryAction({ kind: "unit", name: "bag" })).toEqual(
        refused('"Rice" is on the list in both bag and pcs, which can\'t be added up. Change one of them first.'),
      );
      expect(await renameShoppingCategoryAction({ kind: "unit", from: "g", to: "kg" })).toEqual(
        refused('"Saffron" would be 0,002 kg; an amount is between 0,01 and 1.000.'),
      );
      expect(await renameShoppingCategoryAction({ kind: "unit", from: "l", to: "ml" })).toEqual(
        refused('"Oil" would be 2.000 ml; an amount is between 0,01 and 1.000.'),
      );
      expect(await list()).toEqual(before);
      expect(await getShoppingCategories(userA, "unit")).toEqual(expect.arrayContaining(["bag", "g", "l"]));
    });

    it("refuses the Undo of a unit merge when the split can't be made, and changes nothing [HSHOP-04]", async () => {
      const flourG = succeeded(await addShoppingItemAction({ name: "Flour", amount: 500, unit: "g" })).item;
      succeeded(await addShoppingItemAction({ name: "Flour", amount: 1, unit: "kg" }));
      const { change } = succeeded(await renameShoppingCategoryAction({ kind: "unit", from: "g", to: "kg" }));
      const undo = { kind: "unit" as const, name: "g", current: "kg", ...change!, dropCurrent: false };
      // The same name and unit added since: splitting would make two rows of one item.
      const twin = succeeded(await addShoppingItemAction({ name: "Flour", amount: 200, unit: "g" })).item;
      const after = await list();
      expect(await revertShoppingCategoryAction(undo)).toEqual(refused('Can\'t undo: "kg" has changed since.'));
      expect(await list()).toEqual(after);
      // The row it merged into gone for good (cleared, then the next Clear bought): nothing to split.
      const [merged] = (await getShoppingList(userA)).filter((i) => i.unit === "kg");
      await deleteShoppingItemAction(twin.id);
      succeeded(await toggleShoppingItemAction(merged.id, true));
      succeeded(await clearBoughtItemsAction({ itemIds: [merged.id] }));
      const other = succeeded(await addShoppingItemAction({ name: "Salt" })).item;
      succeeded(await toggleShoppingItemAction(other.id, true));
      succeeded(await clearBoughtItemsAction({ itemIds: [other.id] })); // purges the batch before it
      expect(await revertShoppingCategoryAction(undo)).toEqual(refused('Can\'t undo: "kg" has changed since.'));
      expect((await admin.query("SELECT cleared_at FROM shopping_items WHERE id = $1", [flourG.id])).rows).toEqual([]);
    });

    it("an Undo of a tick puts the row back in its place [HSHOP-06]", async () => {
      const apple = succeeded(await addShoppingItemAction({ name: "Apple" })).item;
      succeeded(await addShoppingItemAction({ name: "Banana" }));
      const names = async () => (await getShoppingList(userA)).map((i) => i.name);
      const ticked = succeeded(await toggleShoppingItemAction(apple.id, true));
      expect(await names()).toEqual(["Banana", "Apple"]);
      authState.id = userB;
      expect(await toggleShoppingItemAction(apple.id, false, apple.checkedAt)).toEqual(refused(SHOPPING_ITEM_GONE));
      authState.id = "";
      expect(await toggleShoppingItemAction(apple.id, false, apple.checkedAt)).toEqual(refused(SIGNED_OUT));
      authState.id = userA;
      // Undo sends the time the box had before the tick (none), so Apple is back above Banana.
      expect(succeeded(await toggleShoppingItemAction(apple.id, false, apple.checkedAt)).item.checkedAt).toBeNull();
      expect(await names()).toEqual(["Apple", "Banana"]);
      // A plain untick is a new change: the row goes last among the unbought.
      succeeded(await toggleShoppingItemAction(apple.id, true));
      succeeded(await toggleShoppingItemAction(apple.id, false));
      expect(await names()).toEqual(["Banana", "Apple"]);
      // The Undo of the untick sends the tick's time back, as text the way a page sends it.
      succeeded(await toggleShoppingItemAction(apple.id, true, ticked.item.checkedAt!.toISOString()));
      expect((await getShoppingList(userA)).find((i) => i.id === apple.id)?.checkedAt).toEqual(ticked.item.checkedAt);
    });

    it("clears more than 500 bought items at once and Undo brings them all back; past 5.000 it refuses up front [HSHOP-07]", async () => {
      const ids = await boughtRows(userA, 600);
      authState.id = userB;
      expect(succeeded(await clearBoughtItemsAction({ itemIds: ids })).deletedCount).toBe(0);
      authState.id = userA;
      expect(succeeded(await clearBoughtItemsAction({ itemIds: ids })).deletedCount).toBe(600);
      expect(await getShoppingList(userA)).toHaveLength(0);
      expect(succeeded(await restoreShoppingItemsAction({ itemIds: ids })).items).toHaveLength(600);
      const tooMany = Array.from({ length: 5001 }, () => randomUUID());
      expect(await clearBoughtItemsAction({ itemIds: tooMany })).toEqual(refused("Too many (max 5000)"));
      expect(await restoreShoppingItemsAction({ itemIds: tooMany })).toEqual(refused("Too many (max 5000)"));
      expect(await getShoppingList(userA)).toHaveLength(600);
    });

    it("keeps only the last Clear bought's batch: each clear deletes the rows taken off before it [HSHOP-09]", async () => {
      const [first, gone] = await boughtRows(userA, 2);
      const [kept] = await boughtRows(userB, 1);
      succeeded(await clearBoughtItemsAction({ itemIds: [first] }));
      succeeded(await deleteShoppingItemAction(gone));
      expect(await rowCount(userA)).toBe(2); // both still there for their Undo
      const [second] = await boughtRows(userA, 1);
      succeeded(await clearBoughtItemsAction({ itemIds: [second] }));
      expect(await rowCount(userA)).toBe(1);
      expect(await restoreShoppingItemsAction({ itemIds: [first, gone] })).toEqual(refused("Item not found."));
      expect(succeeded(await restoreShoppingItemsAction({ itemIds: [second] })).items.map((i) => i.id)).toEqual([second]);
      // A clear that takes nothing off deletes nothing; another user's rows are never touched.
      succeeded(await deleteShoppingItemAction(second));
      succeeded(await clearBoughtItemsAction({ itemIds: [randomUUID()] }));
      expect(await rowCount(userA)).toBe(1);
      expect(await rowCount(userB)).toBe(1);
      expect((await getShoppingList(userB)).map((i) => i.id)).toEqual([kept]);
    });

    it("refuses a reorder past 200 names, a 201st name and an Undo past 5.000 items, in words [HSHOP-08]", async () => {
      const names = Array.from({ length: 201 }, (_, i) => `c${i}`);
      expect(await reorderShoppingCategoriesAction({ names })).toEqual(refused("Too many (max 200)"));
      expect(await reorderShoppingCategoriesAction({ kind: "unit", names })).toEqual(refused("Too many (max 200)"));
      await admin.query("INSERT INTO shopping_categories (user_id, name, sort_order) SELECT $1, 'c' || g, g FROM generate_series(1, 200) g", [userA]);
      succeeded(await reorderShoppingCategoriesAction({ names: names.slice(1).reverse() }));
      expect((await getShoppingCategories(userA))[0]).toBe("c200");
      expect(await addShoppingCategoryAction({ name: "one more" })).toEqual(refused("You can have at most 200 categories."));
      // An item's new category or unit is added to its list, so past the cap the add or edit is refused, and writes nothing.
      expect(await addShoppingItemAction({ name: "Tea", category: "one more" })).toEqual(refused("You can have at most 200 categories."));
      expect(await rowCount(userA)).toBe(0);
      const { item: tea } = succeeded(await addShoppingItemAction({ name: "Tea", category: "c1" }));
      expect(await updateShoppingItemAction({ itemId: tea.id, name: "Tea", amount: 2, unit: "pcs", category: "one more" })).toEqual(
        refused("You can have at most 200 categories."),
      );
      await admin.query("INSERT INTO shopping_units (user_id, name, sort_order) SELECT $1, 'u' || g, g FROM generate_series(1, 200) g", [userA]);
      expect(await addShoppingItemAction({ name: "Rice", unit: "sack" })).toEqual(refused("You can have at most 200 units."));
      expect(await updateShoppingItemAction({ itemId: tea.id, name: "Tea", amount: 2, unit: "sack", category: "c1" })).toEqual(
        refused("You can have at most 200 units."),
      );
      expect(await list()).toEqual(["Tea 1 pcs c1"]);
      expect(await getShoppingCategories(userA)).toHaveLength(200);
      expect(await getShoppingCategories(userA, "unit")).toHaveLength(200);
      const itemIds = Array.from({ length: 5001 }, () => randomUUID());
      expect(await revertShoppingCategoryAction({ name: "c1", current: "other", sortOrder: 1, itemIds, dropCurrent: false })).toEqual(
        refused("Too many (max 5000)"),
      );
      // The Undo of a delete puts the name back, so past the cap it is refused like a new name: never 201 names.
      for (const kind of ["category", "unit"] as const) {
        const word = kind === "unit" ? "units" : "categories";
        const prefix = kind === "unit" ? "u" : "c";
        const { change } = succeeded(await deleteShoppingCategoryAction({ kind, name: `${prefix}2` }));
        succeeded(await addShoppingCategoryAction({ kind, name: "newcomer" }));
        const undo = { kind, name: `${prefix}2`, current: kind === "unit" ? "pcs" : "other", ...change!, dropCurrent: false };
        expect(await revertShoppingCategoryAction(undo)).toEqual(refused(`You can have at most 200 ${word}.`));
        expect(await getShoppingCategories(userA, kind)).toHaveLength(200);
        expect(await getShoppingCategories(userA, kind)).not.toContain(`${prefix}2`);
      }
      // A rename's Undo puts one name back for another, so at the cap it still goes through: the list never grows.
      for (const kind of ["category", "unit"] as const) {
        const prefix = kind === "unit" ? "u" : "c";
        const { change } = succeeded(await renameShoppingCategoryAction({ kind, from: `${prefix}1`, to: "zren" }));
        succeeded(await revertShoppingCategoryAction({ kind, name: `${prefix}1`, current: "zren", ...change!, dropCurrent: !change!.merged }));
        const names = await getShoppingCategories(userA, kind);
        expect(names).toHaveLength(200);
        expect(names).toContain(`${prefix}1`);
        expect(names).not.toContain("zren");
      }
      expect(await list()).toEqual(["Tea 1 pcs c1"]);
    });

    it("never seeds a list again once emptied: \"meat\" can then be added [HSHOP-15]", async () => {
      expect(await getShoppingCategories(userA)).toEqual(["meat", "produce", "dairy", "bakery", "pantry"]);
      for (const name of await getShoppingCategories(userA)) succeeded(await deleteShoppingCategoryAction({ name }));
      expect(await getShoppingCategories(userA)).toEqual([]);
      succeeded(await addShoppingCategoryAction({ name: "meat" }));
      expect(await getShoppingCategories(userA)).toEqual(["meat"]);
      for (const name of await getShoppingCategories(userA, "unit")) succeeded(await deleteShoppingCategoryAction({ kind: "unit", name }));
      expect(await getShoppingCategories(userA, "unit")).toEqual([]);
      expect(await getShoppingCategories(userA)).toEqual(["meat"]);
      // A user with a shopping item already is not new either.
      succeeded(await addShoppingItemAction({ name: "Tape", category: "other" }));
      authState.id = userB;
      await admin.query("INSERT INTO shopping_items (user_id, name) VALUES ($1, 'Old')", [userB]);
      expect(await getShoppingCategories(userB)).toEqual([]);
    });

    for (const kind of ["category", "unit"] as const) {
      const [from, to, other] = kind === "category" ? ["dairy", "milky", "cream"] : ["bag", "sack", "crate"];
      const field = kind === "category" ? "category" : "unit";
      const filed = (name: string) => (kind === "category" ? { category: name } : { unit: name });

      it(`an Undo of a ${kind} rename keeps an item filed under the new name since in a listed name [HSHOP-03]`, async () => {
        const { item: first } = succeeded(await addShoppingItemAction({ name: "Milk", ...filed(from) }));
        const { change } = succeeded(await renameShoppingCategoryAction({ kind, from, to }));
        const { item: later } = succeeded(await addShoppingItemAction({ name: "Butter", ...filed(to) }));
        const undo = { kind, name: from, current: to, ...change!, dropCurrent: !change!.merged };
        expect(succeeded(await revertShoppingCategoryAction(undo)).keptCurrent).toBe(true);
        const rows = await getShoppingList(userA);
        expect(rows.find((i) => i.id === first.id)?.[field]).toBe(from);
        expect(rows.find((i) => i.id === later.id)?.[field]).toBe(to);
        expect(await getShoppingCategories(userA, kind)).toEqual(expect.arrayContaining([from, to]));
      });

      it(`refuses the Undo of a ${kind} rename once the new name is renamed again, and changes nothing [HSHOP-03]`, async () => {
        const { item } = succeeded(await addShoppingItemAction({ name: "Milk", ...filed(from) }));
        const { change } = succeeded(await renameShoppingCategoryAction({ kind, from, to }));
        succeeded(await renameShoppingCategoryAction({ kind, from: to, to: other }));
        const names = await getShoppingCategories(userA, kind);
        const undo = { kind, name: from, current: to, ...change!, dropCurrent: !change!.merged };
        expect(await revertShoppingCategoryAction(undo)).toEqual(refused(`Can't undo: "${to}" has changed since.`));
        expect((await getShoppingList(userA)).find((i) => i.id === item.id)?.[field]).toBe(other);
        expect(await getShoppingCategories(userA, kind)).toEqual(names);
      });
    }

    it("refuses an edit of an item no longer on the list, for its owner and anyone else alike [HSHOP-16]", async () => {
      const { item } = succeeded(await addShoppingItemAction({ name: "Jam", category: "pantry" }));
      const edit = { itemId: item.id, name: "Jam", amount: 2, unit: "jar", category: "pantry" };
      authState.id = userB;
      expect(await updateShoppingItemAction(edit)).toEqual(refused(SHOPPING_ITEM_GONE));
      expect(await list()).toEqual(["Jam 1 pcs pantry"]);
      authState.id = userA;
      succeeded(await deleteShoppingItemAction(item.id));
      expect(await updateShoppingItemAction(edit)).toEqual(refused(SHOPPING_ITEM_GONE));
      expect((await admin.query("SELECT amount FROM shopping_items WHERE id = $1", [item.id])).rows[0].amount).toBe("1.00");
    });

    it("answers a tick, delete or edit of an item merged or deleted since that it is no longer on the list, before any other check [HSHOP-16]", async () => {
      // A stale page: the row was deleted (on another device) and is gone; a row merged away is gone the same way.
      const { item: jam } = succeeded(await addShoppingItemAction({ name: "Jam" }));
      const { item: tea } = succeeded(await addShoppingItemAction({ name: "Tea" }));
      succeeded(await deleteShoppingItemAction(jam.id));
      expect(await toggleShoppingItemAction(jam.id, true)).toEqual(refused(SHOPPING_ITEM_GONE));
      expect(await deleteShoppingItemAction(jam.id)).toEqual(refused(SHOPPING_ITEM_GONE));
      // The edit names an item still on the list (Tea, pcs), yet the item's absence is what it says.
      expect(await updateShoppingItemAction({ itemId: jam.id, name: "Tea", amount: 1, unit: "pcs", category: "other" })).toEqual(
        refused(SHOPPING_ITEM_GONE),
      );
      expect(await list()).toEqual(["Tea 1 pcs other"]);
      expect(await updateShoppingItemAction({ itemId: tea.id, name: "Tea", amount: 3, unit: "pcs", category: "other" })).toMatchObject({ success: true });
    });
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
        addShoppingItemAction({ id: itemId, name: "Eggs" }),
        toggleShoppingItemAction(itemId, true),
        toggleShoppingItemAction(itemId, false, new Date()),
        deleteShoppingItemAction(itemId),
        clearBoughtItemsAction({ itemIds: [itemId] }),
        updateShoppingItemAction({ itemId, name: "Eggs", amount: 1, unit: "pcs", category: "dairy" }),
        unmergeShoppingItemAction({ itemId, before: { id: randomUUID(), name: "Eggs", amount: 1, unit: "pcs", category: "dairy", isBought: false, checkedAt: null } }),
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
        revertShoppingCategoryAction({
          kind: "unit",
          name: "g",
          current: "kg",
          sortOrder: 1,
          itemIds: [itemId],
          dropCurrent: false,
          merges: [{ id: itemId, into: randomUUID(), amount: 1, category: "other", isBought: false }],
          amounts: [{ id: itemId, amount: 125 }],
        }),
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
      await expect(setWaterAction({ date: today })).resolves.toEqual({ success: false, error: "Nothing to save" });

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
      await expect(toggleShoppingItemAction(item.id, true)).resolves.toEqual({ success: false, error: SHOPPING_ITEM_GONE });
      await expect(deleteShoppingItemAction(item.id)).resolves.toEqual({ success: false, error: SHOPPING_ITEM_GONE });
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
      await expect(updateTargetsAction({})).resolves.toEqual({ success: false, error: "Nothing to save" });

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
      expect([first.repeated, again.repeated]).toEqual([false, true]); // the page says "Already saved", without an Undo
      expect((await getDailyFoodSummary(userA, today)).meals).toHaveLength(1);

      const weigh = { id: randomUUID(), date: today, kilograms: 80.5 };
      const added = succeeded(await saveWeightAction(weigh));
      const repeat = succeeded(await saveWeightAction(weigh));
      expect([added.previous, repeat.previous]).toEqual([null, null]); // the repeat is still the add, not an edit of it
      expect([added.repeated, repeat.repeated]).toEqual([false, true]);
      expect(repeat.entry?.id).toBe(weigh.id);
      expect(await listWeightEntries(userA)).toHaveLength(1);
    });

    it("undoes a weight edit only while the day still holds the value the edit saved, for its owner only [D-040]", async () => {
      const today = toISODate();
      const changed = { success: false, error: CHANGED_ELSEWHERE };
      authState.id = userA;
      succeeded(await saveWeightAction({ id: randomUUID(), date: today, kilograms: 80 }));
      succeeded(await saveWeightAction({ id: randomUUID(), date: today, kilograms: 81 })); // the edit the Undo takes back
      const undo = { date: today, kilograms: 80, from: 81 };
      // Another user's Undo finds no day of theirs at 81: refused, and nothing is added for them or changed for the owner.
      authState.id = userB;
      expect(await saveWeightAction(undo)).toEqual(changed);
      expect(await listWeightEntries(userB)).toEqual([]);
      expect((await listWeightEntries(userA)).map((w) => w.kilograms)).toEqual(["81.00"]);
      // Another device set 85 since: the owner's Undo is refused and the 85 stays.
      authState.id = userA;
      succeeded(await saveWeightAction({ id: randomUUID(), date: today, kilograms: 85 }));
      expect(await saveWeightAction(undo)).toEqual(changed);
      expect((await listWeightEntries(userA)).map((w) => w.kilograms)).toEqual(["85.00"]);
      // Back at 81, the same Undo writes 80.
      succeeded(await saveWeightAction({ id: randomUUID(), date: today, kilograms: 81 }));
      expect(succeeded(await saveWeightAction(undo)).entry.kilograms).toBe("80.00");
      // A day deleted since is not made again.
      const { entry } = succeeded(await saveWeightAction({ id: randomUUID(), date: today, kilograms: 81 }));
      succeeded(await deleteWeightAction(entry.id));
      expect(await saveWeightAction(undo)).toEqual(changed);
      expect(await listWeightEntries(userA)).toEqual([]);
    });

    it("answers WEIGHT_ENTRY_GONE to a delete of a weigh-in no longer there, and to another user's [D-040]", async () => {
      const today = toISODate();
      const gone = { success: false, error: WEIGHT_ENTRY_GONE };
      authState.id = userA;
      const { entry } = succeeded(await saveWeightAction({ id: randomUUID(), date: today, kilograms: 80 }));
      // Another user's delete finds nothing of theirs: the same answer, and the owner's weigh-in stays.
      authState.id = userB;
      expect(await deleteWeightAction(entry.id)).toEqual(gone);
      authState.id = userA;
      expect(await listWeightEntries(userA)).toEqual([entry]);
      // The owner's delete, then a second one (another device's, or a repeat): the second is the "gone" refusal.
      succeeded(await deleteWeightAction(entry.id));
      expect(await deleteWeightAction(entry.id)).toEqual(gone);
      expect(await listWeightEntries(userA)).toEqual([]);
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
      expect(await logMealAction(empty)).toEqual({ success: false, error: "Enter calories or a macro above 0" });
      expect((await getDailyFoodSummary(userA, toISODate())).meals).toEqual([]);
    });

    it("refuses a meal over a limit in one sentence that names the field once [U5]", async () => {
      authState.id = userA;
      const meal = { date: toISODate(), name: "Meal", calories: 100, protein: 0, carbs: 0, fat: 0 };
      expect(await logMealAction({ ...meal, calories: 10001 })).toEqual({ success: false, error: "Calories must be 10.000 or less" });
      expect(await logMealAction({ ...meal, fat: 1000.5 })).toEqual({ success: false, error: "Protein, carbs and fat must each be 1.000 g or less" });
      expect((await getDailyFoodSummary(userA, toISODate())).meals).toEqual([]);
    });
  });
});
