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
import { users, weightEntries } from "@/db/schema";
import {
  addShoppingItem,
  addWater,
  deleteMeal,
  getDailyFoodSummary,
  getNutritionTargets,
  clearBoughtShoppingItems,
  getShoppingHistory,
  getShoppingList,
  getWeightAnalytics,
  logMeal,
  renameShoppingCategory,
  restoreShoppingItems,
  toggleShoppingItem,
  updateDailySteps,
  updateNutritionTargets,
  updateShoppingItem,
} from "@/lib/food";
import {
  addWaterAction,
  clearBoughtItemsAction,
  addShoppingItemAction,
  deleteMealAction,
  logMealAction,
  renameShoppingCategoryAction,
  restoreShoppingItemsAction,
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
      "TRUNCATE TABLE shopping_items, meal_plan_days, meal_plans, recipe_ingredients, recipes, meals, daily_metrics, nutrition_targets, workout_sets, workout_sessions, workout_split_day_exercises, workout_split_days, workout_splits, exercises, weight_entries, users CASCADE",
    );
  });

  beforeEach(async () => {
    await admin.query(
      "TRUNCATE TABLE shopping_items, meal_plan_days, meal_plans, recipe_ingredients, recipes, meals, daily_metrics, nutrition_targets, workout_sets, workout_sessions, workout_split_day_exercises, workout_split_days, workout_splits, exercises, weight_entries, users CASCADE",
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
      mealType: "lunch",
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
      mealType: "dinner",
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

  it("calculates 7-day rolling average and weekly rate of change for body weight", async () => {
    // Seed 14 days of weight data
    // Week 1 (7 days): steady at 80.0 kg
    // Week 2 (7 days): steady at 80.5 kg (+0.5 kg gaining trend)
    const baseDate = new Date("2026-11-01");

    for (let i = 13; i >= 7; i--) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      await db.insert(weightEntries).values({
        userId: userA,
        date: dateStr,
        kilograms: "80.00",
      });
    }

    for (let i = 6; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      await db.insert(weightEntries).values({
        userId: userA,
        date: dateStr,
        kilograms: "80.50",
      });
    }

    const analytics = await getWeightAnalytics(userA);
    expect(analytics.latestWeight).toBe(80.5);
    expect(analytics.sevenDayAverage).toBe(80.5);
    expect(analytics.previousWeekAverage).toBe(80.0);
    expect(analytics.weeklyRateOfChange).toBe(0.5);
    expect(analytics.trend).toBe("gaining");

    // User B has no entries
    const analyticsB = await getWeightAnalytics(userB);
    expect(analyticsB.sevenDayAverage).toBeNull();
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

    // Clearing hides bought items but keeps them for quick add; undo brings them back.
    await toggleShoppingItem(userA, oil.id, true);
    const cleared = await clearBoughtShoppingItems(userA);
    expect(cleared.map((i) => i.id)).toEqual([oil.id]);
    expect((await getShoppingList(userA)).map((i) => i.unit)).toEqual(["ml"]);
    expect((await getShoppingHistory(userA)).map((h) => h.name)).toEqual(["Olive Oil"]); // one entry per name
    await restoreShoppingItems(userA, [oil.id]);
    expect(await getShoppingList(userA)).toHaveLength(2);

    const edited = await updateShoppingItem(userA, { itemId: oil.id, name: "Rapeseed Oil", amount: 2, unit: "l", category: "oils" });
    expect(edited).toMatchObject({ name: "Rapeseed Oil", unit: "l", category: "oils" });
    expect((await renameShoppingCategory(userA, "pantry", "dry goods")).length).toBe(1);
    expect((await getShoppingList(userA)).map((i) => i.category).sort()).toEqual(["dry goods", "oils"]);

    // User B sees, changes and restores none of it.
    expect(await getShoppingList(userB)).toHaveLength(0);
    expect(await getShoppingHistory(userB)).toHaveLength(0);
    expect(await updateShoppingItem(userB, { itemId: oil.id, name: "X", amount: 1, unit: "pcs", category: "other" })).toBeUndefined();
    expect(await renameShoppingCategory(userB, "oils", "x")).toHaveLength(0);
    expect(await restoreShoppingItems(userB, [oil.id])).toHaveLength(0);
  });

  describe("Server Actions for Food", () => {
    it("rejects unauthenticated requests", async () => {
      authState.id = "";
      await expect(
        logMealAction({
          date: "2026-11-04",
          mealType: "lunch",
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

      await expect(addWaterAction("2026-11-04", 250)).rejects.toThrow(
        "Authentication required.",
      );
      await expect(updateStepsAction("2026-11-04", 5000)).rejects.toThrow(
        "Authentication required.",
      );
    });

    it("executes food server actions for authenticated owner", async () => {
      authState.id = userA;

      // 1. Log meal
      const mealRes = await logMealAction({
        date: "2026-11-04",
        mealType: "snack",
        name: "Whey Shake",
        calories: 200,
        protein: 30,
        carbs: 5,
        fat: 3,
      });
      expect(mealRes.success).toBe(true);
      expect(mealRes.meal.name).toBe("Whey Shake");

      // 2. Add water
      const waterRes = await addWaterAction("2026-11-04", 500);
      expect(waterRes.success).toBe(true);
      expect(waterRes.metrics.waterMl).toBe(500);

      // 3. Update steps
      const stepsRes = await updateStepsAction("2026-11-04", 10500);
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
      expect((await renameShoppingCategoryAction({ from: "dairy", to: "fridge" })).renamedCount).toBe(1);
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
      expect((await renameShoppingCategoryAction({ from: "fridge", to: "x" })).renamedCount).toBe(0);
      authState.id = userA;

      // 7. Delete meal
      const delMealRes = await deleteMealAction(mealRes.meal.id);
      expect(delMealRes.success).toBe(true);
    });
  });
});
