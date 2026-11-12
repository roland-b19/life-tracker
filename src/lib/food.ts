import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailyMetrics,
  meals,
  nutritionTargets,
  recipes,
  shoppingCategories,
  shoppingItems,
  weightEntries,
} from "@/db/schema";
import {
  CreateShoppingItemInput,
  LogMealInput,
  RestoreMealInput,
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
import { weekStartOf, weightStats, type WeightStats } from "./weight-stats";


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

/** Puts a deleted meal back as it was; an id that is already taken is left alone and returns null. */
export async function restoreMeal(userId: string, input: RestoreMealInput) {
  const [restored] = await db
    .insert(meals)
    .values({
      ...input,
      userId,
      protein: input.protein.toFixed(1),
      carbs: input.carbs.toFixed(1),
      fat: input.fat.toFixed(1),
      isEstimated: input.isEstimated ?? false,
    })
    .onConflictDoNothing()
    .returning();
  return restored ?? null;
}

/** Foods logged before, newest first, one entry per name: the "Past foods" sheet and the assistant's context. */
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

/** Takes a food off the "Past foods" list without touching the days it was logged on; returns the meals it hid. */
export async function forgetPastFood(userId: string, name: string) {
  const hidden = await db
    .update(meals)
    .set({ forgotten: true })
    .where(and(eq(meals.userId, userId), eq(meals.forgotten, false), sql`lower(${meals.name}) = lower(${name})`))
    .returning({ id: meals.id });
  return hidden.map((m) => m.id);
}

/** Undo of `forgetPastFood`: exactly the meals it hid come back. */
export async function restorePastFood(userId: string, ids: string[]) {
  if (ids.length === 0) return;
  await db.update(meals).set({ forgotten: false }).where(and(eq(meals.userId, userId), inArray(meals.id, ids)));
}

export async function deleteMeal(userId: string, mealId: string) {
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
      waterMl: Math.max(0, amountMl),
      steps: 0,
    })
    .onConflictDoUpdate({
      target: [dailyMetrics.userId, dailyMetrics.date],
      set: {
        waterMl: sql`GREATEST(0, ${dailyMetrics.waterMl} + ${amountMl})`,
      },
    })
    .returning();

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

  return updated;
}

export type MetricKind = "water" | "steps";
const metricField = { water: "waterMl", steps: "steps" } as const;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Days with water or steps logged, newest first. */
export async function getDailyMetricsHistory(userId: string) {
  return db
    .select({ date: dailyMetrics.date, waterMl: dailyMetrics.waterMl, steps: dailyMetrics.steps })
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.userId, userId), sql`(${dailyMetrics.waterMl} > 0 OR ${dailyMetrics.steps} > 0)`))
    .orderBy(desc(dailyMetrics.date));
}

async function writeMetric(tx: Tx | typeof db, userId: string, date: string, kind: MetricKind, value: number) {
  const field = metricField[kind];
  await tx
    .insert(dailyMetrics)
    .values({ userId, date, [field]: value })
    .onConflictDoUpdate({ target: [dailyMetrics.userId, dailyMetrics.date], set: { [field]: value } });
}

/**
 * Sets a day's water or steps. With `previousDate` the value moves there from that day (an edit).
 * Returns false, writing nothing, when the target day already has a value of its own.
 */
export async function saveDailyMetric(
  userId: string,
  input: { kind: MetricKind; date: string; value: number; previousDate?: string },
) {
  const { kind, date, value, previousDate } = input;
  return db.transaction(async (tx) => {
    if (previousDate !== date) {
      // shortcut: a day with no row yet is not locked, so two tabs adding the same day at once both win; fine for one user.
      const [row] = await tx
        .select({ waterMl: dailyMetrics.waterMl, steps: dailyMetrics.steps })
        .from(dailyMetrics)
        .where(and(eq(dailyMetrics.userId, userId), eq(dailyMetrics.date, date)))
        .for("update");
      if (row && row[metricField[kind]] > 0) return false;
      if (previousDate) await writeMetric(tx, userId, previousDate, kind, 0);
    }
    await writeMetric(tx, userId, date, kind, value);
    return true;
  });
}

export const clearDailyMetric = (userId: string, kind: MetricKind, date: string) =>
  writeMetric(db, userId, date, kind, 0);

/** Weight stats for the Health page; `today` is the user's calendar day. */
export async function getWeightAnalytics(userId: string, today: string): Promise<WeightStats> {
  // Only this and last week plus the latest weigh-in are needed (see weightStats), not the whole history.
  const since = addDays(weekStartOf(today), -7);
  const entries = await db
    .select({ date: weightEntries.date, kilograms: weightEntries.kilograms })
    .from(weightEntries)
    .where(
      and(
        eq(weightEntries.userId, userId),
        or(
          gte(weightEntries.date, since),
          eq(weightEntries.date, sql`(select max(date) from weight_entries where user_id = ${userId})`),
        ),
      ),
    );
  return weightStats(
    entries.map((e) => ({ date: e.date, kilograms: Number(e.kilograms) })),
    today,
  );
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
  input: CreateShoppingItemInput,
) {
  await ensureShoppingCategory(userId, input.category);
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
    const amount = same.isBought ? input.amount : Math.min(9999.99, Number(same.amount) + input.amount);
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
  if (updated) await ensureShoppingCategory(userId, input.category);
  return updated;
}

/** Store sections a new user starts with, in walking order. */
const DEFAULT_SHOPPING_CATEGORIES = ["meat", "produce", "dairy", "bakery", "pantry"];
const ownCategory = (userId: string, name: string) =>
  and(eq(shoppingCategories.userId, userId), eq(shoppingCategories.name, name));

/** Adds a category at the end of the user's list unless it is there already or is the built-in "other". */
async function ensureShoppingCategory(userId: string, name: string) {
  if (name === "other") return;
  await db
    .insert(shoppingCategories)
    .values({
      userId,
      name,
      sortOrder: sql`(select coalesce(max(${shoppingCategories.sortOrder}), 0) + 1 from ${shoppingCategories} where ${shoppingCategories.userId} = ${userId})`,
    })
    .onConflictDoNothing();
}

/** The user's categories in order, without "other". */
export async function getShoppingCategories(userId: string): Promise<string[]> {
  const list = () =>
    db
      .select({ name: shoppingCategories.name })
      .from(shoppingCategories)
      .where(eq(shoppingCategories.userId, userId))
      .orderBy(asc(shoppingCategories.sortOrder), asc(shoppingCategories.name));
  let rows = await list();
  if (rows.length === 0) {
    // shortcut: seeds whenever the list is empty, so deleting every category brings the defaults back; store a "seeded" flag if that annoys.
    const used = await db
      .selectDistinct({ category: shoppingItems.category })
      .from(shoppingItems)
      .where(eq(shoppingItems.userId, userId));
    const names = [...new Set([...DEFAULT_SHOPPING_CATEGORIES, ...used.map((u) => u.category)])].filter((n) => n !== "other");
    await db
      .insert(shoppingCategories)
      .values(names.map((name, i) => ({ userId, name, sortOrder: i + 1 })))
      .onConflictDoNothing();
    rows = await list();
  }
  return rows.map((r) => r.name);
}

/** Puts the user's categories in the given order, top first; names that are not theirs change nothing. */
export async function reorderShoppingCategories(userId: string, names: string[]) {
  await db.transaction(async (tx) => {
    for (const [i, name] of names.entries()) await tx.update(shoppingCategories).set({ sortOrder: i + 1 }).where(ownCategory(userId, name));
  });
}

/** Returns false when the user already has a category with that name. */
export async function addShoppingCategory(userId: string, name: string) {
  const [existing] = await db.select().from(shoppingCategories).where(ownCategory(userId, name));
  if (existing) return false;
  await ensureShoppingCategory(userId, name);
  return true;
}

/** Re-files the user's items (history included) of one category to another; returns the ids moved. */
async function moveShoppingItems(tx: Pick<typeof db, "update">, userId: string, from: string, to: string) {
  const rows = await tx
    .update(shoppingItems)
    .set({ category: to })
    .where(and(eq(shoppingItems.userId, userId), eq(shoppingItems.category, from)))
    .returning({ id: shoppingItems.id });
  return rows.map((r) => r.id);
}

/** Renames a category on all the user's items, history included; renaming onto an existing one merges the two. */
export async function renameShoppingCategory(userId: string, from: string, to: string) {
  return db.transaction(async (tx): Promise<CategoryChange | null> => {
    const [old] = await tx.delete(shoppingCategories).where(ownCategory(userId, from)).returning();
    if (!old) return null;
    const created = await tx
      .insert(shoppingCategories)
      .values({ userId, name: to, sortOrder: old.sortOrder })
      .onConflictDoNothing()
      .returning();
    return { sortOrder: old.sortOrder, itemIds: await moveShoppingItems(tx, userId, from, to), merged: created.length === 0 };
  });
}

/** Deletes a category; its items, history included, move to "other". */
export async function deleteShoppingCategory(userId: string, name: string) {
  return db.transaction(async (tx): Promise<CategoryChange | null> => {
    const [old] = await tx.delete(shoppingCategories).where(ownCategory(userId, name)).returning();
    if (!old) return null;
    return { sortOrder: old.sortOrder, itemIds: await moveShoppingItems(tx, userId, name, "other"), merged: false };
  });
}

/** Undoes a rename or delete (see `revertCategory`): the category returns and exactly the moved items are re-filed. */
export async function revertShoppingCategory(
  userId: string,
  input: { name: string; current: string; sortOrder: number; itemIds: string[]; dropCurrent: boolean },
) {
  const { name, current, sortOrder, itemIds, dropCurrent } = input;
  await db.transaction(async (tx) => {
    await tx.insert(shoppingCategories).values({ userId, name, sortOrder }).onConflictDoNothing();
    if (itemIds.length > 0)
      await tx
        .update(shoppingItems)
        .set({ category: name })
        .where(and(eq(shoppingItems.userId, userId), eq(shoppingItems.category, current), inArray(shoppingItems.id, itemIds)));
    if (dropCurrent && current !== "other") await tx.delete(shoppingCategories).where(ownCategory(userId, current));
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
    .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.userId, userId)))
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

/** Takes bought items off the list; they stay in the table so Undo can restore them. */
export async function clearBoughtShoppingItems(userId: string) {
  return db
    .update(shoppingItems)
    .set({ clearedAt: new Date() })
    .where(and(onList(userId), eq(shoppingItems.isBought, true)))
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
