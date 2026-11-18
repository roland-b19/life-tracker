import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailyMetrics,
  meals,
  nutritionTargets,
  recipes,
  shoppingCategories,
  shoppingItems,
  shoppingUnits,
  weightEntries,
} from "@/db/schema";
import {
  AddShoppingItemInput,
  LogMealInput,
  LogWeightInput,
  MAX_WATER_ML,
  RestoreMealInput,
  RestoreWeightInput,
  UpdateShoppingItemInput,
  UpdateNutritionTargetsInput,
} from "./validations/food";
import {
  ensureUserNutritionTargets,
  ensureUserSampleRecipes,
} from "./food-seed";
import type { CategoryChange } from "./categories";
import { compareShopping } from "./check-order";
import { addDays } from "./format-date";
import { lockUser } from "./gym-seed";


export async function getNutritionTargets(userId: string) {
  return ensureUserNutritionTargets(userId);
}

export async function updateNutritionTargets(
  userId: string,
  input: UpdateNutritionTargetsInput,
) {
  const [updated] = await db
    .insert(nutritionTargets)
    .values({
      userId,
      calories: input.calories,
      proteinGrams: input.proteinGrams,
      carbsGrams: input.carbsGrams,
      fatGrams: input.fatGrams,
      waterMl: input.waterMl,
      steps: input.steps,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [nutritionTargets.userId],
      set: {
        calories: input.calories,
        proteinGrams: input.proteinGrams,
        carbsGrams: input.carbsGrams,
        fatGrams: input.fatGrams,
        waterMl: input.waterMl,
        steps: input.steps,
        updatedAt: new Date(),
      },
    })
    .returning();

  return updated;
}

export async function getDailyFoodSummary(userId: string, date: string) {
  const [dayMeals, [metrics]] = await Promise.all([
    db
      .select()
      .from(meals)
      .where(and(eq(meals.userId, userId), eq(meals.date, date)))
      .orderBy(meals.createdAt),
    db
      .select()
      .from(dailyMetrics)
      .where(and(eq(dailyMetrics.userId, userId), eq(dailyMetrics.date, date)))
      .limit(1),
  ]);

  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;

  for (const m of dayMeals) {
    totalCalories += m.calories;
    totalProtein += parseFloat(m.protein) || 0;
    totalCarbs += parseFloat(m.carbs) || 0;
    totalFat += parseFloat(m.fat) || 0;
  }

  return {
    date,
    meals: dayMeals,
    totals: {
      calories: totalCalories,
      protein: Math.round(totalProtein * 10) / 10,
      carbs: Math.round(totalCarbs * 10) / 10,
      fat: Math.round(totalFat * 10) / 10,
    },
    metrics: metrics ?? {
      waterMl: 0,
      steps: 0,
      notes: null,
    },
  };
}

export async function logMeal(userId: string, input: LogMealInput) {
  const [created] = await db
    .insert(meals)
    .values({
      userId,
      date: input.date,
      name: input.name,
      calories: input.calories,
      protein: input.protein.toFixed(1),
      carbs: input.carbs.toFixed(1),
      fat: input.fat.toFixed(1),
      isEstimated: input.isEstimated ?? false,
    })
    .returning();

  return created;
}

/** Undo of a delete: the meal comes back under its old id and time. A taken id gives back undefined. */
export async function restoreMeal(userId: string, input: RestoreMealInput) {
  const [restored] = await db
    .insert(meals)
    .values({
      id: input.id,
      userId,
      date: input.date,
      name: input.name,
      calories: input.calories,
      protein: input.protein.toFixed(1),
      carbs: input.carbs.toFixed(1),
      fat: input.fat.toFixed(1),
      isEstimated: input.isEstimated ?? false,
      createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
    })
    .onConflictDoNothing()
    .returning();
  return restored;
}

/** Foods logged before, newest first, one entry per name: the assistant's context. */
export async function getPastFoods(userId: string, limit = 40) {
  const latest = db
    .selectDistinctOn([sql`lower(${meals.name})`], {
      name: meals.name,
      calories: meals.calories,
      protein: meals.protein,
      carbs: meals.carbs,
      fat: meals.fat,
      isEstimated: meals.isEstimated,
      createdAt: meals.createdAt,
    })
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.forgotten, false)))
    .orderBy(sql`lower(${meals.name})`, desc(meals.createdAt))
    .as("latest");
  return db.select().from(latest).orderBy(desc(latest.createdAt)).limit(limit);
}

/** `assertDay` throws for a day that can no longer change, so a delete never outlives the day its Undo is allowed on. */
export async function deleteMeal(userId: string, mealId: string, assertDay?: (date: string) => void) {
  if (assertDay) {
    const [meal] = await db.select({ date: meals.date }).from(meals).where(and(eq(meals.id, mealId), eq(meals.userId, userId)));
    if (meal) assertDay(meal.date);
  }
  const [deleted] = await db
    .delete(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
    .returning();

  return deleted;
}

export async function addWater(userId: string, date: string, amountMl: number) {
  const [updated] = await db
    .insert(dailyMetrics)
    .values({
      userId,
      date,
      waterMl: Math.min(MAX_WATER_ML, Math.max(0, amountMl)),
      steps: 0,
    })
    .onConflictDoUpdate({
      target: [dailyMetrics.userId, dailyMetrics.date],
      set: {
        waterMl: sql`LEAST(${MAX_WATER_ML}, GREATEST(0, ${dailyMetrics.waterMl} + ${amountMl}))`,
      },
    })
    .returning();

  await pruneMetrics(userId, date);
  return updated;
}

export async function updateDailyWater(userId: string, date: string, waterMl: number) {
  const [updated] = await db
    .insert(dailyMetrics)
    .values({ userId, date, waterMl: Math.max(0, waterMl), steps: 0 })
    .onConflictDoUpdate({ target: [dailyMetrics.userId, dailyMetrics.date], set: { waterMl: Math.max(0, waterMl) } })
    .returning();

  await pruneMetrics(userId, date);
  return updated;
}

export async function updateDailySteps(userId: string, date: string, steps: number) {
  const [updated] = await db
    .insert(dailyMetrics)
    .values({
      userId,
      date,
      waterMl: 0,
      steps: Math.max(0, steps),
    })
    .onConflictDoUpdate({
      target: [dailyMetrics.userId, dailyMetrics.date],
      set: {
        steps: Math.max(0, steps),
      },
    })
    .returning();

  await pruneMetrics(userId, date);
  return updated;
}

/** Health keeps water and steps for the last 7 days only (the 7-day average): older rows go when a day is written. */
const pruneMetrics = (userId: string, date: string) =>
  db.delete(dailyMetrics).where(and(eq(dailyMetrics.userId, userId), lt(dailyMetrics.date, addDays(date, -6))));

/** The days with water or steps logged in the last 7 days up to `today`, newest first. */
export async function getDailyMetricsHistory(userId: string, today: string) {
  return db
    .select({ date: dailyMetrics.date, waterMl: dailyMetrics.waterMl, steps: dailyMetrics.steps })
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.userId, userId), gte(dailyMetrics.date, addDays(today, -6)), lte(dailyMetrics.date, today)))
    .orderBy(desc(dailyMetrics.date));
}

/**
 * Shopping List Operations
 */
/** The user's items still on the list; cleared ones stay so Undo can restore them. */
const onList = (userId: string) => and(eq(shoppingItems.userId, userId), isNull(shoppingItems.clearedAt));

export async function getShoppingList(userId: string) {
  return db
    .select()
    .from(shoppingItems)
    .where(onList(userId))
    .orderBy(shoppingItems.category, shoppingItems.name)
    .then((rows) => rows.sort(compareShopping));
}

/** Adds an item, or adds its amount to the same item (same name and unit) already on the list. */
export async function addShoppingItem(
  userId: string,
  input: AddShoppingItemInput,
) {
  await ensureShoppingCategory(userId, input.category);
  await ensureShoppingCategory(userId, input.unit, "unit");
  const [same] = await db
    .select()
    .from(shoppingItems)
    .where(
      and(
        onList(userId),
        sql`lower(${shoppingItems.name}) = lower(${input.name})`,
        sql`lower(${shoppingItems.unit}) = lower(${input.unit})`,
      ),
    )
    .limit(1);

  if (same) {
    // Already bought but needed again: it starts over at the new amount.
    const amount = same.isBought ? input.amount : Math.min(1000, Number(same.amount) + input.amount);
    const [merged] = await db
      .update(shoppingItems)
      .set({ amount: amount.toFixed(2), isBought: false, checkedAt: new Date() })
      .where(eq(shoppingItems.id, same.id))
      .returning();
    return merged;
  }

  const [item] = await db
    .insert(shoppingItems)
    .values({
      userId,
      name: input.name,
      amount: input.amount.toFixed(2),
      unit: input.unit,
      category: input.category,
      isBought: false,
    })
    .returning();

  return item;
}

/** Whether another item on the list already has this name and unit (any case): the add form merges those, so an edit must not make two. */
export async function hasDuplicateShoppingItem(userId: string, input: { itemId: string; name: string; unit: string }) {
  const [row] = await db
    .select({ id: shoppingItems.id })
    .from(shoppingItems)
    .where(
      and(
        onList(userId),
        ne(shoppingItems.id, input.itemId),
        sql`lower(${shoppingItems.name}) = lower(${input.name})`,
        sql`lower(${shoppingItems.unit}) = lower(${input.unit})`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function updateShoppingItem(userId: string, input: UpdateShoppingItemInput) {
  const [updated] = await db
    .update(shoppingItems)
    .set({
      name: input.name,
      amount: input.amount.toFixed(2),
      unit: input.unit,
      category: input.category,
      ...(input.isBought !== undefined && { isBought: input.isBought }),
      ...(input.checkedAt !== undefined && { checkedAt: input.checkedAt }),
    })
    .where(and(eq(shoppingItems.id, input.itemId), onList(userId)))
    .returning();
  if (updated) {
    await ensureShoppingCategory(userId, input.category);
    await ensureShoppingCategory(userId, input.unit, "unit");
  }
  return updated;
}

/**
 * A shopping item is filed by two lists the user manages: its category (store section) and its unit. Both work the
 * same way, so the functions below take the `kind`; the "Category" in their names then means either list.
 */
const DIMS = {
  category: {
    table: shoppingCategories,
    fallback: "other",
    defaults: ["meat", "produce", "dairy", "bakery", "pantry"], // a new user's store sections, in walking order
    set: (v: string) => ({ category: v }),
    on: (v: string) => eq(shoppingItems.category, v),
  },
  unit: {
    // shortcut: same columns as shopping_categories, so the one table type serves both; give them a shared type if a third list appears.
    table: shoppingUnits as unknown as typeof shoppingCategories,
    fallback: "pcs",
    defaults: ["g", "kg", "ml", "l", "pack", "bottle", "can", "jar", "box", "bag", "bunch"],
    set: (v: string) => ({ unit: v }),
    on: (v: string) => eq(shoppingItems.unit, v),
  },
};
type ShoppingKind = keyof typeof DIMS;

const ownCategory = (userId: string, name: string, kind: ShoppingKind) =>
  and(eq(DIMS[kind].table.userId, userId), eq(DIMS[kind].table.name, name));

/** Adds a name at the end of the user's list unless it is there already or is the built-in fallback ("other", "pcs"). */
async function ensureShoppingCategory(userId: string, name: string, kind: ShoppingKind = "category") {
  const { table, fallback } = DIMS[kind];
  if (name === fallback) return;
  await db
    .insert(table)
    .values({
      userId,
      name,
      sortOrder: sql`(select coalesce(max(${table.sortOrder}), 0) + 1 from ${table} where ${table.userId} = ${userId})`,
    })
    .onConflictDoNothing();
}

/** The user's names in order, without the fallback. */
export async function getShoppingCategories(userId: string, kind: ShoppingKind = "category"): Promise<string[]> {
  const { table, fallback, defaults } = DIMS[kind];
  const list = () =>
    db
      .select({ name: table.name })
      .from(table)
      .where(eq(table.userId, userId))
      .orderBy(asc(table.sortOrder), asc(table.name));
  let rows = await list();
  if (rows.length === 0) {
    // shortcut: seeds whenever the list is empty, so deleting every name brings the defaults back; store a "seeded" flag if that annoys.
    const column = kind === "unit" ? shoppingItems.unit : shoppingItems.category;
    const used = await db.selectDistinct({ name: column }).from(shoppingItems).where(eq(shoppingItems.userId, userId));
    const names = [...new Set([...defaults, ...used.map((u) => u.name)])].filter((n) => n !== fallback);
    await db
      .insert(table)
      .values(names.map((name, i) => ({ userId, name, sortOrder: i + 1 })))
      .onConflictDoNothing();
    rows = await list();
  }
  return rows.map((r) => r.name);
}

/** Puts the user's names in the given order, top first; names that are not theirs change nothing. */
export async function reorderShoppingCategories(userId: string, names: string[], kind: ShoppingKind = "category") {
  const { table } = DIMS[kind];
  await db.transaction(async (tx) => {
    for (const [i, name] of names.entries()) await tx.update(table).set({ sortOrder: i + 1 }).where(ownCategory(userId, name, kind));
  });
}

/** Returns false when the user already has a name like that. */
export async function addShoppingCategory(userId: string, name: string, kind: ShoppingKind = "category") {
  const [existing] = await db.select().from(DIMS[kind].table).where(ownCategory(userId, name, kind));
  if (existing) return false;
  await ensureShoppingCategory(userId, name, kind);
  return true;
}

/** Re-files the user's items (history included) from one name to another; returns the ids moved. */
async function moveShoppingItems(tx: Pick<typeof db, "update">, userId: string, from: string, to: string, kind: ShoppingKind) {
  const d = DIMS[kind];
  const rows = await tx
    .update(shoppingItems)
    .set(d.set(to))
    .where(and(eq(shoppingItems.userId, userId), d.on(from)))
    .returning({ id: shoppingItems.id });
  return rows.map((r) => r.id);
}

/** Renames on all the user's items, history included; renaming onto an existing name merges the two. */
export async function renameShoppingCategory(userId: string, from: string, to: string, kind: ShoppingKind = "category") {
  const { table } = DIMS[kind];
  return db.transaction(async (tx): Promise<CategoryChange | null> => {
    const [old] = await tx.delete(table).where(ownCategory(userId, from, kind)).returning();
    if (!old) return null;
    const created = await tx.insert(table).values({ userId, name: to, sortOrder: old.sortOrder }).onConflictDoNothing().returning();
    return { sortOrder: old.sortOrder, itemIds: await moveShoppingItems(tx, userId, from, to, kind), merged: created.length === 0 };
  });
}

/** Deletes a name; its items, history included, move to the fallback. */
export async function deleteShoppingCategory(userId: string, name: string, kind: ShoppingKind = "category") {
  const { table, fallback } = DIMS[kind];
  return db.transaction(async (tx): Promise<CategoryChange | null> => {
    const [old] = await tx.delete(table).where(ownCategory(userId, name, kind)).returning();
    if (!old) return null;
    return { sortOrder: old.sortOrder, itemIds: await moveShoppingItems(tx, userId, name, fallback, kind), merged: false };
  });
}

/** Undoes a rename or delete (see `revertCategory`): the name returns and exactly the moved items are re-filed. */
export async function revertShoppingCategory(
  userId: string,
  input: { name: string; current: string; sortOrder: number; itemIds: string[]; dropCurrent: boolean },
  kind: ShoppingKind = "category",
) {
  const { name, current, sortOrder, itemIds, dropCurrent } = input;
  const d = DIMS[kind];
  await db.transaction(async (tx) => {
    await tx.insert(d.table).values({ userId, name, sortOrder }).onConflictDoNothing();
    if (itemIds.length > 0)
      await tx
        .update(shoppingItems)
        .set(d.set(name))
        .where(and(eq(shoppingItems.userId, userId), d.on(current), inArray(shoppingItems.id, itemIds)));
    if (dropCurrent && current !== d.fallback && current !== name) await tx.delete(d.table).where(ownCategory(userId, current, kind));
  });
}

export async function toggleShoppingItem(
  userId: string,
  itemId: string,
  isBought: boolean,
) {
  const [updated] = await db
    .update(shoppingItems)
    .set({ isBought, checkedAt: new Date() })
    .where(and(eq(shoppingItems.id, itemId), onList(userId)))
    .returning();

  return updated;
}

/** Takes an item off the list; the row stays so Undo (restoreShoppingItems) brings it back exactly, bought state included. */
export async function deleteShoppingItem(userId: string, itemId: string) {
  const [deleted] = await db
    .update(shoppingItems)
    .set({ clearedAt: new Date() })
    .where(and(eq(shoppingItems.id, itemId), onList(userId)))
    .returning();

  return deleted;
}

/** Takes the given bought items off the list (only those: the screen may show fewer than the server holds); they stay in the table so Undo can restore them. */
export async function clearBoughtShoppingItems(userId: string, itemIds: string[]) {
  return db
    .update(shoppingItems)
    .set({ clearedAt: new Date() })
    .where(and(onList(userId), eq(shoppingItems.isBought, true), inArray(shoppingItems.id, itemIds)))
    .returning();
}

/** Undoes a clear: puts the user's cleared items back on the list. */
export async function restoreShoppingItems(userId: string, itemIds: string[]) {
  return db
    .update(shoppingItems)
    .set({ clearedAt: null })
    .where(and(eq(shoppingItems.userId, userId), inArray(shoppingItems.id, itemIds)))
    .returning();
}

/** The user's recipes, which the food assistant can read. */
export async function getUserRecipes(userId: string) {
  await ensureUserSampleRecipes(userId);
  return db
    .select({
      id: recipes.id,
      name: recipes.name,
      description: recipes.description,
      calories: recipes.calories,
      protein: recipes.protein,
      carbs: recipes.carbs,
      fat: recipes.fat,
    })
    .from(recipes)
    .where(eq(recipes.userId, userId));
}

const weightColumns = {
  id: weightEntries.id,
  date: weightEntries.date,
  kilograms: weightEntries.kilograms,
};

/** Every weigh-in is kept forever; `since` only limits what a page reads. */
export async function listWeightEntries(userId: string, since?: string) {
  return db
    .select(weightColumns)
    .from(weightEntries)
    .where(and(eq(weightEntries.userId, userId), since ? gte(weightEntries.date, since) : undefined))
    .orderBy(desc(weightEntries.date));
}

/** Sets the day's weight: creates the weigh-in, or changes the one the day already has. `previous` is that earlier row, or null when this save created the day. */
export async function saveWeightEntry(userId: string, input: LogWeightInput) {
  const kilograms = input.kilograms.toFixed(2);
  return db.transaction(async (tx) => {
    await lockUser(tx, "weight", userId); // two saves of a new day at once must not both insert
    const [previous] = await tx
      .select(weightColumns)
      .from(weightEntries)
      .where(and(eq(weightEntries.userId, userId), eq(weightEntries.date, input.date)));
    if (!previous) {
      const [entry] = await tx.insert(weightEntries).values({ userId, date: input.date, kilograms }).returning(weightColumns);
      return { entry, previous: null };
    }
    const [entry] = await tx
      .update(weightEntries)
      .set({ kilograms })
      .where(and(eq(weightEntries.id, previous.id), eq(weightEntries.userId, userId)))
      .returning(weightColumns);
    return { entry, previous };
  });
}

export async function deleteWeightEntry(userId: string, id: string) {
  const [deleted] = await db
    .delete(weightEntries)
    .where(and(eq(weightEntries.id, id), eq(weightEntries.userId, userId)))
    .returning({ id: weightEntries.id });
  return deleted;
}

/** Undo of a delete: the weigh-in comes back under its old id. A taken id or day gives back undefined. */
export async function restoreWeightEntry(userId: string, input: RestoreWeightInput) {
  const [restored] = await db
    .insert(weightEntries)
    .values({ id: input.id, userId, date: input.date, kilograms: input.kilograms.toFixed(2) })
    .onConflictDoNothing()
    .returning(weightColumns);
  return restored;
}
