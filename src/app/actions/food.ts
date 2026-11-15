"use server";

import { requireUser } from "@/server/auth";
import { toISODate } from "@/lib/format-date";
import { isoDate, uuid } from "@/lib/validations/common";
import {
  MAX_STEPS,
  MAX_WATER_ML,
  metricDayEditable,
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
  deleteMeal,
  deleteShoppingCategory,
  deleteShoppingItem,
  hasDuplicateShoppingItem,
  logMeal,
  renameShoppingCategory,
  reorderShoppingCategories,
  restoreMeal,
  restoreShoppingItems,
  revertShoppingCategory,
  toggleShoppingItem,
  updateDailySteps,
  updateDailyWater,
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
  const deleted = await deleteMeal(userId, uuid.parse(mealId), assertWritableDay);
  return { success: true, deleted };
}

/** Undo of a delete. */
export async function restoreMealAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = restoreMealSchema.parse(rawInput);
  assertWritableDay(parsed.date);
  const meal = await restoreMeal(userId, parsed);
  return { success: meal !== undefined, meal };
}

export async function addWaterAction(date: string, amountMl: number) {
  const userId = await requireUser();
  if (!Number.isInteger(amountMl) || Math.abs(amountMl) > MAX_WATER_ML) {
    throw new Error("Invalid water parameters");
  }
  assertWritableDay(isoDate.parse(date));
  const metrics = await addWater(userId, date, amountMl);
  return { success: true, metrics };
}

/** Sets the day's water to an exact amount, so an edit from a stale screen cannot add onto a newer total. */
export async function setWaterAction(date: string, waterMl: number) {
  const userId = await requireUser();
  if (!Number.isInteger(waterMl) || waterMl < 0 || waterMl > MAX_WATER_ML) {
    throw new Error("Invalid water parameters");
  }
  assertWritableDay(isoDate.parse(date));
  const metrics = await updateDailyWater(userId, date, waterMl);
  return { success: true, metrics };
}

export async function updateStepsAction(date: string, steps: number) {
  const userId = await requireUser();
  if (!Number.isInteger(steps) || steps < 0 || steps > MAX_STEPS) {
    throw new Error("Invalid steps parameter");
  }
  assertWritableDay(isoDate.parse(date));
  const metrics = await updateDailySteps(userId, date, steps);
  return { success: true, metrics };
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
  if (!item) throw new Error("Item not found");
  return { success: true, item };
}

export async function deleteShoppingItemAction(itemId: string) {
  const userId = await requireUser();
  const deleted = await deleteShoppingItem(userId, uuid.parse(itemId));
  if (!deleted) throw new Error("Item not found");
  return { success: true, deleted };
}

/** Clears the bought items the screen shows (their ids), not every bought item the server holds. */
export async function clearBoughtItemsAction(rawInput: unknown) {
  const userId = await requireUser();
  const { itemIds } = restoreShoppingItemsSchema.parse(rawInput);
  const deleted = await clearBoughtShoppingItems(userId, itemIds);
  return { success: true, deletedCount: deleted.length };
}

export async function restoreShoppingItemsAction(rawInput: unknown) {
  const userId = await requireUser();
  const { itemIds } = restoreShoppingItemsSchema.parse(rawInput);
  const items = await restoreShoppingItems(userId, itemIds);
  if (items.length === 0) throw new Error("Item not found");
  return { success: true, items };
}

export async function updateShoppingItemAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = updateShoppingItemSchema.parse(rawInput);
  // Refusals come back as data: Next hides a thrown message from the browser in production.
  if (await hasDuplicateShoppingItem(userId, parsed)) {
    return { success: false as const, error: `"${parsed.name}" is already on the list with this unit.` };
  }
  const item = await updateShoppingItem(userId, parsed);
  if (!item) return { success: false as const, error: "This item is no longer on the list." };
  return { success: true as const, item };
}

export async function addShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { kind, name } = shoppingCategoryNameSchema.parse(rawInput);
  const added = await addShoppingCategory(userId, name, kind);
  return { success: added, name };
}

export async function reorderShoppingCategoriesAction(rawInput: unknown) {
  const userId = await requireUser();
  const { kind, names } = reorderShoppingCategoriesSchema.parse(rawInput);
  await reorderShoppingCategories(userId, names, kind);
  return { success: true };
}

export async function renameShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { kind, from, to } = renameShoppingCategorySchema.parse(rawInput);
  const change = await renameShoppingCategory(userId, from, to, kind);
  return { success: change !== null, change };
}

export async function deleteShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { kind, name } = shoppingCategoryNameSchema.parse(rawInput);
  const change = await deleteShoppingCategory(userId, name, kind);
  return { success: change !== null, change };
}

export async function revertShoppingCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const { kind, ...input } = revertShoppingCategorySchema.parse(rawInput);
  await revertShoppingCategory(userId, input, kind);
  return { success: true };
}
