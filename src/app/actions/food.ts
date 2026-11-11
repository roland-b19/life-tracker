"use server";

import { requireUser } from "@/server/auth";
import { toISODate } from "@/lib/format-date";
import { isoDate, uuid } from "@/lib/validations/common";
import {
  clearDailyMetricSchema,
  forgetPastFoodSchema,
  restorePastFoodSchema,
  day,
  metricDayEditable,
  saveDailyMetricSchema,
  createShoppingItemSchema,
  logMealSchema,
  restoreMealSchema,
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
  forgetPastFood,
  restorePastFood,
  deleteShoppingCategory,
  deleteShoppingItem,
  logMeal,
  restoreMeal,
  renameShoppingCategory,
  reorderShoppingCategories,
  restoreShoppingItems,
  revertShoppingCategory,
  toggleShoppingItem,
  updateDailySteps,
  updateNutritionTargets,
  updateShoppingItem,
} from "@/lib/food";

/** Water, steps and meals are written for today or yesterday only; older days are history (same rule as saveDailyMetricAction). */
function assertWritableDay(date: string) {
  if (!metricDayEditable(date, toISODate())) throw new Error("Only today and yesterday can be changed.");
}

export async function logMealAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = logMealSchema.parse(rawInput);
  assertWritableDay(parsed.date);
  const meal = await logMeal(userId, parsed);
  return { success: true, meal };
}

export async function deleteMealAction(mealId: string) {
  const userId = await requireUser();
  const deleted = await deleteMeal(userId, uuid.parse(mealId));
  return { success: true, deleted };
}

export async function restoreMealAction(rawInput: unknown) {
  const userId = await requireUser();
  const input = restoreMealSchema.parse(rawInput);
  assertWritableDay(input.date);
  const meal = await restoreMeal(userId, input);
  return { success: meal !== null, meal };
}

/** Removes a food from the "Past foods" list (the days it was logged on keep it); `ids` is what Undo sends back. */
export async function forgetPastFoodAction(rawInput: unknown) {
  const userId = await requireUser();
  const { name } = forgetPastFoodSchema.parse(rawInput);
  const ids = await forgetPastFood(userId, name);
  return { success: true, ids };
}

export async function restorePastFoodAction(rawInput: unknown) {
  const userId = await requireUser();
  await restorePastFood(userId, restorePastFoodSchema.parse(rawInput).ids);
  return { success: true };
}

export async function addWaterAction(date: string, amountMl: number) {
  const userId = await requireUser();
  if (!Number.isInteger(amountMl) || Math.abs(amountMl) > 20000) {
    throw new Error("Invalid water parameters");
  }
  assertWritableDay(isoDate.parse(date));
  const metrics = await addWater(userId, date, amountMl);
  return { success: true, metrics };
}

export async function updateStepsAction(date: string, steps: number) {
  const userId = await requireUser();
  if (!Number.isInteger(steps) || steps < 0 || steps > 200000) {
    throw new Error("Invalid steps parameter");
  }
  assertWritableDay(isoDate.parse(date));
  const metrics = await updateDailySteps(userId, date, steps);
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
  const input = saveDailyMetricSchema.parse(rawInput);
  assertWritableDay(input.date);
  if (input.previousDate) assertWritableDay(input.previousDate);
  const saved = await saveDailyMetric(userId, input);
  return { saved };
}

export async function clearDailyMetricAction(rawInput: unknown) {
  const userId = await requireUser();
  const { kind, date } = clearDailyMetricSchema.parse(rawInput);
  if (!metricDayEditable(date, toISODate())) throw new Error("Only today and yesterday can be changed.");
  await clearDailyMetric(userId, kind, date);
  return { success: true };
}

export async function updateTargetsAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = updateNutritionTargetsSchema.parse(rawInput);
  const targets = await updateNutritionTargets(userId, parsed);
  return { success: true, targets };
}

export async function addShoppingItemAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = createShoppingItemSchema.parse(rawInput);
  const item = await addShoppingItem(userId, parsed);
  return { success: true, item };
}

export async function toggleShoppingItemAction(itemId: string, isBought: boolean) {
  const userId = await requireUser();
  if (typeof isBought !== "boolean") {
    throw new Error("Invalid parameters");
  }
  const item = await toggleShoppingItem(userId, uuid.parse(itemId), isBought);
  return { success: true, item };
}

export async function deleteShoppingItemAction(itemId: string) {
  const userId = await requireUser();
  const deleted = await deleteShoppingItem(userId, uuid.parse(itemId));
  return { success: true, deleted };
}

export async function clearBoughtItemsAction() {
  const userId = await requireUser();
  const deleted = await clearBoughtShoppingItems(userId);
  return { success: true, deletedCount: deleted.length };
}

export async function restoreShoppingItemsAction(rawInput: unknown) {
  const userId = await requireUser();
  const { itemIds } = restoreShoppingItemsSchema.parse(rawInput);
  const items = await restoreShoppingItems(userId, itemIds);
  return { success: true, items };
}

export async function updateShoppingItemAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = updateShoppingItemSchema.parse(rawInput);
  const item = await updateShoppingItem(userId, parsed);
  if (!item) throw new Error("Item not found");
  return { success: true, item };
}

export async function addShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { name } = shoppingCategoryNameSchema.parse(rawInput);
  const added = await addShoppingCategory(userId, name);
  return { success: added, name };
}

export async function reorderShoppingCategoriesAction(rawInput: unknown) {
  const userId = await requireUser();
  const { names } = reorderShoppingCategoriesSchema.parse(rawInput);
  await reorderShoppingCategories(userId, names);
  return { success: true };
}

export async function renameShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { from, to } = renameShoppingCategorySchema.parse(rawInput);
  const change = await renameShoppingCategory(userId, from, to);
  return { success: change !== null, change };
}

export async function deleteShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { name } = shoppingCategoryNameSchema.parse(rawInput);
  const change = await deleteShoppingCategory(userId, name);
  return { success: change !== null, change };
}

export async function revertShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  await revertShoppingCategory(userId, revertShoppingCategorySchema.parse(rawInput));
  return { success: true };
}
