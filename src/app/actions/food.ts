"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import {
  clearDailyMetricSchema,
  saveDailyMetricSchema,
  createShoppingItemSchema,
  logMealSchema,
  renameShoppingCategorySchema,
  shoppingCategoryNameSchema,
  restoreShoppingItemsSchema,
  updateShoppingItemSchema,
  updateNutritionTargetsSchema,
} from "@/lib/validations/food";
import {
  addShoppingCategory,
  addShoppingItem,
  addWater,
  clearBoughtShoppingItems,
  clearDailyMetric,
  getDailyMetricsHistory,
  saveDailyMetric,
  deleteMeal,
  deleteShoppingCategory,
  deleteShoppingItem,
  logMeal,
  renameShoppingCategory,
  restoreShoppingItems,
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
  if (!mealId || typeof mealId !== "string") {
    throw new Error("Invalid meal ID");
  }
  const deleted = await deleteMeal(userId, mealId);
  safeRevalidate("/food");
  return { success: true, deleted };
}

export async function addWaterAction(date: string, amountMl: number) {
  const userId = await requireUser();
  if (!date || !Number.isInteger(amountMl) || Math.abs(amountMl) > 20000) {
    throw new Error("Invalid water parameters");
  }
  const metrics = await addWater(userId, date, amountMl);
  safeRevalidate("/food");
  return { success: true, metrics };
}

export async function updateStepsAction(date: string, steps: number) {
  const userId = await requireUser();
  if (!date || !Number.isInteger(steps) || steps < 0 || steps > 200000) {
    throw new Error("Invalid steps parameter");
  }
  const metrics = await updateDailySteps(userId, date, steps);
  safeRevalidate("/food");
  return { success: true, metrics };
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
  if (!itemId || typeof isBought !== "boolean") {
    throw new Error("Invalid parameters");
  }
  const item = await toggleShoppingItem(userId, itemId, isBought);
  safeRevalidate("/food");
  return { success: true, item };
}

export async function deleteShoppingItemAction(itemId: string) {
  const userId = await requireUser();
  if (!itemId || typeof itemId !== "string") {
    throw new Error("Invalid item ID");
  }
  const deleted = await deleteShoppingItem(userId, itemId);
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

export async function renameShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { from, to } = renameShoppingCategorySchema.parse(rawInput);
  const renamed = await renameShoppingCategory(userId, from, to);
  safeRevalidate("/food");
  return { success: renamed };
}

export async function deleteShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { name } = shoppingCategoryNameSchema.parse(rawInput);
  const deleted = await deleteShoppingCategory(userId, name);
  safeRevalidate("/food");
  return { success: deleted };
}
