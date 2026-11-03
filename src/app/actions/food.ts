"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import {
  createShoppingItemSchema,
  logMealSchema,
  updateNutritionTargetsSchema,
} from "@/lib/validations/food";
import {
  addShoppingItem,
  addWater,
  clearBoughtShoppingItems,
  deleteMeal,
  deleteShoppingItem,
  logMeal,
  populateShoppingListFromRecipes,
  toggleShoppingItem,
  updateDailySteps,
  updateNutritionTargets,
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
  if (!date || typeof amountMl !== "number") {
    throw new Error("Invalid water parameters");
  }
  const metrics = await addWater(userId, date, amountMl);
  safeRevalidate("/food");
  return { success: true, metrics };
}

export async function updateStepsAction(date: string, steps: number) {
  const userId = await requireUser();
  if (!date || typeof steps !== "number") {
    throw new Error("Invalid steps parameter");
  }
  const metrics = await updateDailySteps(userId, date, steps);
  safeRevalidate("/food");
  return { success: true, metrics };
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

export async function generateShoppingListAction() {
  const userId = await requireUser();
  const items = await populateShoppingListFromRecipes(userId);
  safeRevalidate("/food");
  return { success: true, items };
}
