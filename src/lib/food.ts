import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailyMetrics,
  meals,
  nutritionTargets,
  recipes,
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

export interface WeightAnalytics {
  latestWeight: number | null;
  latestDate: string | null;
  sevenDayAverage: number | null;
  previousWeekAverage: number | null;
  weeklyRateOfChange: number | null; // e.g. +0.25 kg/week
  trend: "gaining" | "losing" | "maintaining";
}

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
      mealType: input.mealType,
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
      mealType: meals.mealType,
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

/**
 * 7-Day Moving Average & Rate of Change for Body Weight
 */
export async function getWeightAnalytics(userId: string): Promise<WeightAnalytics> {
  const entries = await db
    .select({
      date: weightEntries.date,
      kilograms: weightEntries.kilograms,
    })
    .from(weightEntries)
    .where(eq(weightEntries.userId, userId))
    .orderBy(asc(weightEntries.date));

  if (entries.length === 0) {
    return {
      latestWeight: null,
      latestDate: null,
      sevenDayAverage: null,
      previousWeekAverage: null,
      weeklyRateOfChange: null,
      trend: "maintaining",
    };
  }

  const latestEntry = entries[entries.length - 1];
  const latestWeight = parseFloat(latestEntry.kilograms);
  const latestDateObj = new Date(latestEntry.date);

  // 7-day rolling window for current average: [latestDate - 6 days, latestDate]
  const currentWeekStart = new Date(latestDateObj);
  currentWeekStart.setDate(currentWeekStart.getDate() - 6);

  // Previous week window: [latestDate - 13 days, latestDate - 7 days]
  const previousWeekStart = new Date(latestDateObj);
  previousWeekStart.setDate(previousWeekStart.getDate() - 13);
  const previousWeekEnd = new Date(latestDateObj);
  previousWeekEnd.setDate(previousWeekEnd.getDate() - 7);

  const currentWeekWeights: number[] = [];
  const previousWeekWeights: number[] = [];

  for (const entry of entries) {
    const entryDate = new Date(entry.date);
    const kg = parseFloat(entry.kilograms);

    if (entryDate >= currentWeekStart && entryDate <= latestDateObj) {
      currentWeekWeights.push(kg);
    } else if (entryDate >= previousWeekStart && entryDate <= previousWeekEnd) {
      previousWeekWeights.push(kg);
    }
  }

  const currentAvg =
    currentWeekWeights.length > 0
      ? currentWeekWeights.reduce((a, b) => a + b, 0) / currentWeekWeights.length
      : latestWeight;

  const prevAvg =
    previousWeekWeights.length > 0
      ? previousWeekWeights.reduce((a, b) => a + b, 0) / previousWeekWeights.length
      : null;

  let weeklyRateOfChange: number | null = null;
  let trend: WeightAnalytics["trend"] = "maintaining";

  if (prevAvg !== null) {
    weeklyRateOfChange = Math.round((currentAvg - prevAvg) * 100) / 100;
    if (weeklyRateOfChange > 0.1) {
      trend = "gaining";
    } else if (weeklyRateOfChange < -0.1) {
      trend = "losing";
    } else {
      trend = "maintaining";
    }
  }

  return {
    latestWeight: Math.round(latestWeight * 100) / 100,
    latestDate: latestEntry.date,
    sevenDayAverage: Math.round(currentAvg * 100) / 100,
    previousWeekAverage: prevAvg !== null ? Math.round(prevAvg * 100) / 100 : null,
    weeklyRateOfChange,
    trend,
  };
}

/**
 * Shopping List Operations
 */
/** The user's items still on the list; cleared ones stay only as quick-add history. */
const onList = (userId: string) => and(eq(shoppingItems.userId, userId), isNull(shoppingItems.clearedAt));

export async function getShoppingList(userId: string) {
  return db
    .select()
    .from(shoppingItems)
    .where(onList(userId))
    .orderBy(shoppingItems.category, shoppingItems.name);
}

/** Everything the user has put on the list before, newest first, one entry per name: the quick-add options. */
export async function getShoppingHistory(userId: string, limit = 30) {
  const rows = await db
    .selectDistinctOn([sql`lower(${shoppingItems.name})`], {
      name: shoppingItems.name,
      amount: shoppingItems.amount,
      unit: shoppingItems.unit,
      category: shoppingItems.category,
      createdAt: shoppingItems.createdAt,
    })
    .from(shoppingItems)
    .where(eq(shoppingItems.userId, userId))
    .orderBy(sql`lower(${shoppingItems.name})`, desc(shoppingItems.createdAt));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

/** Adds an item, or adds its amount to the same item (same name and unit) already on the list. */
export async function addShoppingItem(
  userId: string,
  input: CreateShoppingItemInput,
) {
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
  return updated;
}

/** Renames a category on all the user's items, history included; renaming onto an existing one merges the two. */
export async function renameShoppingCategory(userId: string, from: string, to: string) {
  return db
    .update(shoppingItems)
    .set({ category: to })
    .where(and(eq(shoppingItems.userId, userId), eq(shoppingItems.category, from)))
    .returning({ id: shoppingItems.id });
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

/** Takes bought items off the list; they stay as quick-add history. */
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
