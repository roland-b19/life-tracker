import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
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
  UpdateShoppingItemInput,
  UpdateNutritionTargetsInput,
} from "./validations/food";
import {
  ensureUserNutritionTargets,
  ensureUserSampleRecipes,
} from "./food-seed";
import { weightStats, type WeightStats } from "./weight-stats";


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
  await ensureUserNutritionTargets(userId);

  const dayMeals = await db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.date, date)))
    .orderBy(meals.createdAt);

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

  const [metrics] = await db
    .select()
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.userId, userId), eq(dailyMetrics.date, date)))
    .limit(1);

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

/** Foods logged before, newest first, one entry per name: the "Past foods" sheet and the assistant's context. */
export async function getPastFoods(userId: string, limit = 40) {
  const rows = await db
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
    .where(eq(meals.userId, userId))
    .orderBy(sql`lower(${meals.name})`, desc(meals.createdAt));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
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
  const entries = await db
    .select({ date: weightEntries.date, kilograms: weightEntries.kilograms })
    .from(weightEntries)
    .where(eq(weightEntries.userId, userId));
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
    .orderBy(shoppingItems.category, shoppingItems.name);
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
      .set({ amount: amount.toFixed(2), isBought: false })
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
    .set({ name: input.name, amount: input.amount.toFixed(2), unit: input.unit, category: input.category })
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

/** Returns false when the user already has a category with that name. */
export async function addShoppingCategory(userId: string, name: string) {
  const [existing] = await db.select().from(shoppingCategories).where(ownCategory(userId, name));
  if (existing) return false;
  await ensureShoppingCategory(userId, name);
  return true;
}

/** Renames a category on all the user's items, history included; renaming onto an existing one merges the two. */
export async function renameShoppingCategory(userId: string, from: string, to: string) {
  return db.transaction(async (tx) => {
    const [old] = await tx.delete(shoppingCategories).where(ownCategory(userId, from)).returning();
    if (!old) return false;
    await tx.insert(shoppingCategories).values({ userId, name: to, sortOrder: old.sortOrder }).onConflictDoNothing();
    await tx
      .update(shoppingItems)
      .set({ category: to })
      .where(and(eq(shoppingItems.userId, userId), eq(shoppingItems.category, from)));
    return true;
  });
}

/** Deletes a category; its items, history included, move to "other". */
export async function deleteShoppingCategory(userId: string, name: string) {
  return db.transaction(async (tx) => {
    const [old] = await tx.delete(shoppingCategories).where(ownCategory(userId, name)).returning();
    if (!old) return false;
    await tx
      .update(shoppingItems)
      .set({ category: "other" })
      .where(and(eq(shoppingItems.userId, userId), eq(shoppingItems.category, name)));
    return true;
  });
}

export async function toggleShoppingItem(
  userId: string,
  itemId: string,
  isBought: boolean,
) {
  const [updated] = await db
    .update(shoppingItems)
    .set({ isBought })
    .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.userId, userId)))
    .returning();

  return updated;
}

export async function deleteShoppingItem(userId: string, itemId: string) {
  const [deleted] = await db
    .delete(shoppingItems)
    .where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.userId, userId)))
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
