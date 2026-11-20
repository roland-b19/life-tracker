"use server";

import { requireUser } from "@/server/auth";
import { toISODate } from "@/lib/format-date";
import { metricDayEditable } from "@/lib/rules";
import { uuid } from "@/lib/validations/common";
import { Refusal, respond } from "@/lib/validations/result";
import {
  addShoppingItemSchema,
  logMealSchema,
  logWeightSchema,
  restoreMealSchema,
  restoreWeightSchema,
  renameShoppingCategorySchema,
  reorderShoppingCategoriesSchema,
  shoppingCategoryNameSchema,
  restoreShoppingItemsSchema,
  revertShoppingCategorySchema,
  setWaterSchema,
  toggleShoppingItemSchema,
  updateNutritionTargetsSchema,
  updateShoppingItemSchema,
  updateStepsSchema,
} from "@/lib/validations/food";
import {
  addShoppingCategory,
  addShoppingItem,
  clearBoughtShoppingItems,
  deleteMeal,
  deleteShoppingCategory,
  deleteShoppingItem,
  deleteWeightEntry,
  hasDuplicateShoppingItem,
  logMeal,
  renameShoppingCategory,
  reorderShoppingCategories,
  restoreMeal,
  restoreShoppingItems,
  restoreWeightEntry,
  revertShoppingCategory,
  saveWeightEntry,
  toggleShoppingItem,
  updateDailySteps,
  updateDailyWater,
  updateNutritionTargets,
  updateShoppingItem,
} from "@/lib/food";

/** Meals are written for today or yesterday only; older days are history. */
function assertWritableDay(date: string) {
  if (!metricDayEditable(date, toISODate())) throw new Refusal("Only today and yesterday can be changed.");
}

/** Water, steps and weight are saved for today only (Europe/Bucharest): they are measured on the day. */
function assertToday(date: string) {
  if (date !== toISODate()) throw new Refusal("Only today can be changed.");
}

/** Adds a meal; a repeat of the same add (same id) answers the meal already there, a foreign id answers `meal: null`. */
export async function logMealAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const parsed = logMealSchema.parse(rawInput);
    assertWritableDay(parsed.date);
    return { meal: await logMeal(userId, parsed) };
  });
}

export async function deleteMealAction(mealId: string) {
  return respond(async () => {
    const userId = await requireUser();
    return { deleted: await deleteMeal(userId, uuid.parse(mealId), assertWritableDay) };
  });
}

/** Undo of a delete. */
export async function restoreMealAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const parsed = restoreMealSchema.parse(rawInput);
    assertWritableDay(parsed.date);
    const meal = await restoreMeal(userId, parsed);
    if (meal === undefined) throw new Refusal("This meal could not be restored.");
    return { meal };
  });
}

/** Sets today's weight (creates or changes it). */
export async function saveWeightAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const input = logWeightSchema.parse(rawInput);
    assertToday(input.date);
    return saveWeightEntry(userId, input);
  });
}

/** Deletes a weigh-in of any day: a past entry can still go, and its Undo puts it back. */
export async function deleteWeightAction(entryId: string) {
  return respond(async () => {
    const userId = await requireUser();
    if ((await deleteWeightEntry(userId, uuid.parse(entryId))) === undefined) throw new Refusal("Weight entry not found.");
    return {};
  });
}

/** Undo of a delete. */
export async function restoreWeightAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const entry = await restoreWeightEntry(userId, restoreWeightSchema.parse(rawInput));
    if (entry === undefined) throw new Refusal("This weight entry could not be restored.");
    return { entry };
  });
}

/** Sets today's water total and/or the water goal, together or not at all; a quick tap sends the new total. */
export async function setWaterAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const input = setWaterSchema.parse(rawInput);
    assertToday(input.date);
    return updateDailyWater(userId, input.date, input.waterMl, input.goal);
  });
}

/** Sets today's steps and/or the steps goal, together or not at all. */
export async function updateStepsAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const input = updateStepsSchema.parse(rawInput);
    assertToday(input.date);
    return updateDailySteps(userId, input.date, input.steps, input.goal);
  });
}

/** Saves the goals the edit changed, and only those. */
export async function updateTargetsAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    return { targets: await updateNutritionTargets(userId, updateNutritionTargetsSchema.parse(rawInput)) };
  });
}

export async function addShoppingItemAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    return { item: await addShoppingItem(userId, addShoppingItemSchema.parse(rawInput)) };
  });
}

export async function toggleShoppingItemAction(itemId: string, isBought: boolean) {
  return respond(async () => {
    const userId = await requireUser();
    const input = toggleShoppingItemSchema.parse({ itemId, isBought });
    const item = await toggleShoppingItem(userId, input.itemId, input.isBought);
    if (!item) throw new Refusal("Item not found.");
    return { item };
  });
}

export async function deleteShoppingItemAction(itemId: string) {
  return respond(async () => {
    const userId = await requireUser();
    const deleted = await deleteShoppingItem(userId, uuid.parse(itemId));
    if (!deleted) throw new Refusal("Item not found.");
    return { deleted };
  });
}

/** Clears the bought items the screen shows (their ids), not every bought item the server holds. */
export async function clearBoughtItemsAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const { itemIds } = restoreShoppingItemsSchema.parse(rawInput);
    return { deletedCount: (await clearBoughtShoppingItems(userId, itemIds)).length };
  });
}

export async function restoreShoppingItemsAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const { itemIds } = restoreShoppingItemsSchema.parse(rawInput);
    const items = await restoreShoppingItems(userId, itemIds);
    if (items.length === 0) throw new Refusal("Item not found.");
    return { items };
  });
}

export async function updateShoppingItemAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const parsed = updateShoppingItemSchema.parse(rawInput);
    if (await hasDuplicateShoppingItem(userId, parsed)) throw new Refusal(`"${parsed.name}" is already on the list with this unit.`);
    const item = await updateShoppingItem(userId, parsed);
    if (!item) throw new Refusal("This item is no longer on the list.");
    return { item };
  });
}

export async function addShoppingCategoryAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const { kind, name } = shoppingCategoryNameSchema.parse(rawInput);
    if (!(await addShoppingCategory(userId, name, kind))) throw new Refusal(`"${name}" already exists.`);
    return { name };
  });
}

export async function reorderShoppingCategoriesAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const { kind, names } = reorderShoppingCategoriesSchema.parse(rawInput);
    await reorderShoppingCategories(userId, names, kind);
    return {};
  });
}

export async function renameShoppingCategoryAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const { kind, from, to } = renameShoppingCategorySchema.parse(rawInput);
    const change = await renameShoppingCategory(userId, from, to, kind);
    if (!change) throw new Refusal("Category not found.");
    return { change };
  });
}

export async function deleteShoppingCategoryAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const { kind, name } = shoppingCategoryNameSchema.parse(rawInput);
    const change = await deleteShoppingCategory(userId, name, kind);
    if (!change) throw new Refusal("Category not found.");
    return { change };
  });
}

export async function revertShoppingCategoryAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const { kind, ...input } = revertShoppingCategorySchema.parse(rawInput);
    await revertShoppingCategory(userId, input, kind);
    return {};
  });
}
