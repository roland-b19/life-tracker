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
import { meals, users, weightEntries } from "@/db/schema";
import {
  addShoppingItem,
  addWater,
  deleteMeal,
  getDailyFoodSummary,
  getNutritionTargets,
  clearBoughtShoppingItems,
  getShoppingCategories,
  getShoppingList,
  getPastFoods,
  forgetPastFood,
  restorePastFood,
  getWeightAnalytics,
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
  clearDailyMetricAction,
  listDailyMetricsAction,
  saveDailyMetricAction,
  addShoppingCategoryAction,
  addShoppingItemAction,
  deleteMealAction,
  forgetPastFoodAction,
  restorePastFoodAction,
  restoreMealAction,
  deleteShoppingItemAction,
  deleteShoppingCategoryAction,
  getDaySummaryAction,
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

  it("calculates the weight stats from the owner's weigh-ins only", async () => {
    // Week of Sunday 18.10: 80.00 kg every day; week of Sunday 25.10: 80.50 kg every day.
    for (let i = 0; i < 14; i++) {
      await db.insert(weightEntries).values({
        userId: userA,
        date: addDays("2026-10-18", i),
        kilograms: i < 7 ? "80.00" : "80.50",
      });
    }

    const analytics = await getWeightAnalytics(userA, "2026-10-31");
    expect(analytics.latestWeight).toBe(80.5);
    expect(analytics.sevenDayAverage).toBe(80.5);
    expect(analytics.weekStartWeight).toBe(80.5);
    expect(analytics.sinceLastWeek).toBe(0.5);

    // User B has no entries
    const analyticsB = await getWeightAnalytics(userB, "2026-10-31");
    expect(analyticsB.sevenDayAverage).toBeNull();
  });

  it("reads only the last two weeks of weigh-ins plus the latest one", async () => {
    // A long history ending 100 days before "today": the latest weigh-in still shows, the averages stay empty.
    for (let i = 100; i < 400; i++) {
      await db.insert(weightEntries).values({ userId: userA, date: addDays("2026-10-31", -i), kilograms: `${70 + (i % 5)}.00` });
    }
    const stale = await getWeightAnalytics(userA, "2026-10-31");
    expect(stale.latestDate).toBe(addDays("2026-10-31", -100));
    expect(stale.sevenDayAverage).toBeNull();
    expect(stale.sinceLastWeek).toBeNull();
  });

  it("lists past foods newest first, one per name, up to the limit", async () => {
    for (let i = 0; i < 5; i++) await logMeal(userA, { date: "2026-10-31", name: `Food ${i}`, calories: 100, protein: 1, carbs: 1, fat: 1 });
    await logMeal(userA, { date: "2026-10-31", name: "FOOD 0", calories: 250, protein: 1, carbs: 1, fat: 1 }); // same name, other case, logged last
    const foods = await getPastFoods(userA, 3);
    expect(foods.map((f) => f.name.toLowerCase())).toEqual(["food 0", "food 4", "food 3"]);
    expect(foods[0].calories).toBe(250);
  });

  it("forgets a past food without touching its days, and Undo brings back exactly those meals", async () => {
    const a = await logMeal(userA, { date: "2026-10-30", name: "Soup", calories: 100, protein: 1, carbs: 1, fat: 1 });
    const b = await logMeal(userA, { date: "2026-10-31", name: "soup", calories: 120, protein: 1, carbs: 1, fat: 1 });
    await logMeal(userA, { date: "2026-10-31", name: "Bread", calories: 80, protein: 1, carbs: 1, fat: 1 });
    const ids = await forgetPastFood(userA, "SOUP");
    expect(ids.sort()).toEqual([a.id, b.id].sort());
    expect((await getPastFoods(userA)).map((f) => f.name)).toEqual(["Bread"]);
    expect((await getDailyFoodSummary(userA, "2026-10-31")).meals.map((m) => m.name).sort()).toEqual(["Bread", "soup"]);
    // Another user cannot forget it, and a food logged again shows up again.
    expect(await forgetPastFood(userB, "Bread")).toEqual([]);
    await logMeal(userA, { date: "2026-10-31", name: "Soup", calories: 90, protein: 1, carbs: 1, fat: 1 });
    expect((await getPastFoods(userA)).map((f) => f.name).sort()).toEqual(["Bread", "Soup"]);
    await restorePastFood(userB, ids); // not theirs: nothing changes
    expect((await getPastFoods(userA)).length).toBe(2);
    await restorePastFood(userA, ids);
    expect((await getPastFoods(userA)).length).toBe(2); // the newest "Soup" still represents the name
    expect((await db.select().from(meals).where(eq(meals.forgotten, true))).length).toBe(0);
  });

  it("restores a deleted meal as the very same row, in its place, and refuses a taken id", async () => {
    authState.id = userA;
    const first = await logMeal(userA, { date: toISODate(), name: "Eggs", calories: 200, protein: 10, carbs: 1, fat: 12 });
    const second = await logMeal(userA, { date: toISODate(), name: "Rice", calories: 300, protein: 6, carbs: 60, fat: 1 });
    await db.update(meals).set({ forgotten: true }).where(eq(meals.id, first.id)); // a meal removed from Past foods too
    const before = (await db.select().from(meals).where(eq(meals.id, first.id)))[0];
    await deleteMealAction(first.id);
    const input = { id: before.id, createdAt: before.createdAt, forgotten: true, date: before.date, name: before.name, calories: before.calories, protein: Number(before.protein), carbs: Number(before.carbs), fat: Number(before.fat), isEstimated: before.isEstimated };
    const res = await restoreMealAction(input);
    expect(res.success).toBe(true);
    expect((await db.select().from(meals).where(eq(meals.id, first.id)))[0]).toEqual(before);
    expect((await getDailyFoodSummary(userA, toISODate())).meals.map((m) => m.id)).toEqual([first.id, second.id]);
    expect((await restoreMealAction(input)).success).toBe(false); // the id is taken now
    authState.id = userB;
    await deleteMealAction(first.id); // not B's: nothing happens
    expect((await restoreMealAction({ ...input, id: second.id })).success).toBe(false); // an id A holds cannot be claimed
    authState.id = "";
    await expect(restoreMealAction(input)).rejects.toThrow("Authentication required.");
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
      await expect(forgetPastFoodAction({ name: "Soup" })).rejects.toThrow("Authentication required.");
      await expect(restorePastFoodAction({ ids: [] })).rejects.toThrow("Authentication required.");
      await expect(deleteShoppingCategoryAction({ name: "dairy" })).rejects.toThrow("Authentication required.");
      await expect(
        revertShoppingCategoryAction({ name: "dairy", current: "other", sortOrder: 1, itemIds: [itemId], dropCurrent: false }),
      ).rejects.toThrow("Authentication required.");

      await expect(addWaterAction("2026-11-04", 250)).rejects.toThrow(
        "Authentication required.",
      );
      await expect(updateStepsAction("2026-11-04", 5000)).rejects.toThrow(
        "Authentication required.",
      );
      await expect(getDaySummaryAction("2026-11-04")).rejects.toThrow("Authentication required.");
    });

    it("reads a past day for its owner only", async () => {
      await logMeal(userA, { date: "2026-11-01", name: "Oats", calories: 400, protein: 15, carbs: 60, fat: 8 });
      await addWater(userA, "2026-11-01", 750);

      authState.id = userA;
      const own = await getDaySummaryAction("2026-11-01");
      expect(own.date).toBe("2026-11-01");
      expect(own.meals.map((m) => m.name)).toEqual(["Oats"]);
      expect(own.metrics.waterMl).toBe(750);
      await expect(getDaySummaryAction("1 Nov")).rejects.toThrow();

      authState.id = userB;
      const other = await getDaySummaryAction("2026-11-01");
      expect(other.meals).toHaveLength(0);
      expect(other.metrics.waterMl).toBe(0);
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
        await expect(restoreMealAction({ ...meal, date, id: randomUUID(), createdAt: new Date() })).rejects.toThrow(locked);
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
      await expect(forgetPastFoodAction({ name: " \t " })).rejects.toThrow();
      expect((await logMealAction({ date: today, name: "  Rice  ", calories: 1, protein: 0, carbs: 0, fat: 0 })).meal.name).toBe("Rice");
    });

    it("keeps water and steps history per owner, today and yesterday only: add, move, refuse a taken day, clear", async () => {
      const today = toISODate();
      const yesterday = addDays(today, -1);
      const older = addDays(today, -2);
      authState.id = "";
      await expect(listDailyMetricsAction()).rejects.toThrow("Authentication required.");
      await expect(saveDailyMetricAction({ kind: "water", date: yesterday, value: 500 })).rejects.toThrow(
        "Authentication required.",
      );
      await expect(clearDailyMetricAction({ kind: "water", date: yesterday })).rejects.toThrow(
        "Authentication required.",
      );

      authState.id = userA;
      expect((await saveDailyMetricAction({ kind: "water", date: yesterday, value: 500 })).saved).toBe(true);
      expect((await saveDailyMetricAction({ kind: "steps", date: yesterday, value: 8000 })).saved).toBe(true);
      // The day already has water: a second add is refused, steps there are untouched.
      expect((await saveDailyMetricAction({ kind: "water", date: yesterday, value: 900 })).saved).toBe(false);
      // An edit moves the water to today and leaves the steps on yesterday.
      expect(
        (await saveDailyMetricAction({ kind: "water", date: today, value: 700, previousDate: yesterday })).saved,
      ).toBe(true);
      expect(await listDailyMetricsAction()).toEqual([
        { date: today, waterMl: 700, steps: 0 },
        { date: yesterday, waterMl: 0, steps: 8000 },
      ]);
      await expect(saveDailyMetricAction({ kind: "steps", date: today, value: 0 })).rejects.toThrow();
      await expect(saveDailyMetricAction({ kind: "water", date: today, value: 20001 })).rejects.toThrow();
      await expect(saveDailyMetricAction({ kind: "water", date: "11/03/2026", value: 1 })).rejects.toThrow();

      // Older days (and tomorrow) are history: no add, no move to or from them, no clear.
      const locked = "Only today and yesterday can be changed.";
      await expect(saveDailyMetricAction({ kind: "water", date: older, value: 1 })).rejects.toThrow(locked);
      await expect(saveDailyMetricAction({ kind: "water", date: addDays(today, 1), value: 1 })).rejects.toThrow(locked);
      await expect(
        saveDailyMetricAction({ kind: "steps", date: today, value: 5, previousDate: older }),
      ).rejects.toThrow(locked);
      await expect(clearDailyMetricAction({ kind: "steps", date: older })).rejects.toThrow(locked);

      // Another user sees none of it and their writes land in their own days only.
      authState.id = userB;
      expect(await listDailyMetricsAction()).toEqual([]);
      expect((await saveDailyMetricAction({ kind: "water", date: today, value: 100 })).saved).toBe(true);
      await clearDailyMetricAction({ kind: "steps", date: yesterday });

      authState.id = userA;
      await clearDailyMetricAction({ kind: "water", date: today });
      expect(await listDailyMetricsAction()).toEqual([{ date: yesterday, waterMl: 0, steps: 8000 }]);
    });
  });
});
