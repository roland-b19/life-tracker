"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { isoDate, uuid } from "@/lib/validations/common";
import {
  clearDailyMetricSchema,
  day,
  saveDailyMetricSchema,
  createShoppingItemSchema,
  logMealSchema,
  renameShoppingCategorySchema,
  reorderShoppingCategoriesSchema,
  shoppingCategoryNameSchema,
  restoreShoppingItemsSchema,
  revertShoppingCategorySchema,
  updateShoppingItemSchema,
  updateNutritionTargetsSchema,
} from "@/lib/validations/food";
import {
  addShoppingCategory,
  addShoppingItem,
  addWater,
  clearBoughtShoppingItems,
  clearDailyMetric,
  getDailyFoodSummary,
  getDailyMetricsHistory,
  saveDailyMetric,
  deleteMeal,
  deleteShoppingCategory,
  deleteShoppingItem,
  logMeal,
  renameShoppingCategory,
  reorderShoppingCategories,
  restoreShoppingItems,
  revertShoppingCategory,
  toggleShoppingItem,
  updateDailySteps,
  updateNutritionTargets,
  updateShoppingItem,
} from "@/lib/food";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // No-op in test runner
  }
}

export async function logMealAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = logMealSchema.parse(rawInput);
  const meal = await logMeal(userId, parsed);
  safeRevalidate("/food");
  return { success: true, meal };
}

export async function deleteMealAction(mealId: string) {
  const userId = await requireUser();
  const deleted = await deleteMeal(userId, uuid.parse(mealId));
  safeRevalidate("/food");
  return { success: true, deleted };
}

export async function addWaterAction(date: string, amountMl: number) {
  const userId = await requireUser();
  if (!Number.isInteger(amountMl) || Math.abs(amountMl) > 20000) {
    throw new Error("Invalid water parameters");
  }
  const metrics = await addWater(userId, isoDate.parse(date), amountMl);
  safeRevalidate("/food");
  return { success: true, metrics };
}

export async function updateStepsAction(date: string, steps: number) {
  const userId = await requireUser();
  if (!Number.isInteger(steps) || steps < 0 || steps > 200000) {
    throw new Error("Invalid steps parameter");
  }
  const metrics = await updateDailySteps(userId, isoDate.parse(date), steps);
  safeRevalidate("/food");
  return { success: true, metrics };
}

/** One day's meals and metrics, read-only (the Today tab's past days). */
export async function getDaySummaryAction(date: unknown) {
  const userId = await requireUser();
  return getDailyFoodSummary(userId, day.parse(date));
}

export async function listDailyMetricsAction() {
  const userId = await requireUser();
  return getDailyMetricsHistory(userId);
}

/** `saved: false` when the day already has a value of its own. */
export async function saveDailyMetricAction(rawInput: unknown) {
  const userId = await requireUser();
  const saved = await saveDailyMetric(userId, saveDailyMetricSchema.parse(rawInput));
  safeRevalidate("/food");
  return { saved };
}

export async function clearDailyMetricAction(rawInput: unknown) {
  const userId = await requireUser();
  const { kind, date } = clearDailyMetricSchema.parse(rawInput);
  await clearDailyMetric(userId, kind, date);
  safeRevalidate("/food");
  return { success: true };
}

export async function updateTargetsAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = updateNutritionTargetsSchema.parse(rawInput);
  const targets = await updateNutritionTargets(userId, parsed);
  safeRevalidate("/food");
  return { success: true, targets };
}

export async function addShoppingItemAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = createShoppingItemSchema.parse(rawInput);
  const item = await addShoppingItem(userId, parsed);
  safeRevalidate("/food");
  return { success: true, item };
}

export async function toggleShoppingItemAction(itemId: string, isBought: boolean) {
  const userId = await requireUser();
  if (typeof isBought !== "boolean") {
    throw new Error("Invalid parameters");
  }
  const item = await toggleShoppingItem(userId, uuid.parse(itemId), isBought);
  safeRevalidate("/food");
  return { success: true, item };
}

export async function deleteShoppingItemAction(itemId: string) {
  const userId = await requireUser();
  const deleted = await deleteShoppingItem(userId, uuid.parse(itemId));
  safeRevalidate("/food");
  return { success: true, deleted };
}

export async function clearBoughtItemsAction() {
  const userId = await requireUser();
  const deleted = await clearBoughtShoppingItems(userId);
  safeRevalidate("/food");
  return { success: true, deletedCount: deleted.length };
}

export async function restoreShoppingItemsAction(rawInput: unknown) {
  const userId = await requireUser();
  const { itemIds } = restoreShoppingItemsSchema.parse(rawInput);
  const items = await restoreShoppingItems(userId, itemIds);
  safeRevalidate("/food");
  return { success: true, items };
}

export async function updateShoppingItemAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = updateShoppingItemSchema.parse(rawInput);
  const item = await updateShoppingItem(userId, parsed);
  if (!item) throw new Error("Item not found");
  safeRevalidate("/food");
  return { success: true, item };
}

export async function addShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { name } = shoppingCategoryNameSchema.parse(rawInput);
  const added = await addShoppingCategory(userId, name);
  safeRevalidate("/food");
  return { success: added, name };
}

export async function reorderShoppingCategoriesAction(rawInput: unknown) {
  const userId = await requireUser();
  const { names } = reorderShoppingCategoriesSchema.parse(rawInput);
  await reorderShoppingCategories(userId, names);
  safeRevalidate("/food");
  return { success: true };
}

export async function renameShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { from, to } = renameShoppingCategorySchema.parse(rawInput);
  const change = await renameShoppingCategory(userId, from, to);
  safeRevalidate("/food");
  return { success: change !== null, change };
}

export async function deleteShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { name } = shoppingCategoryNameSchema.parse(rawInput);
  const change = await deleteShoppingCategory(userId, name);
  safeRevalidate("/food");
  return { success: change !== null, change };
}

export async function revertShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  await revertShoppingCategory(userId, revertShoppingCategorySchema.parse(rawInput));
  safeRevalidate("/food");
  return { success: true };
}
