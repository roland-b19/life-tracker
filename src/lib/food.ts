import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailyMetrics,
  meals,
  nutritionTargets,
  recipeIngredients,
  recipes,
  shoppingItems,
  weightEntries,
} from "@/db/schema";
import {
  CreateShoppingItemInput,
  LogMealInput,
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
    })
    .returning();

  return created;
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
export async function getShoppingList(userId: string) {
  return db
    .select()
    .from(shoppingItems)
    .where(eq(shoppingItems.userId, userId))
    .orderBy(shoppingItems.category, shoppingItems.name);
}

export async function addShoppingItem(
  userId: string,
  input: CreateShoppingItemInput,
) {
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

export async function clearBoughtShoppingItems(userId: string) {
  return db
    .delete(shoppingItems)
    .where(and(eq(shoppingItems.userId, userId), eq(shoppingItems.isBought, true)))
    .returning();
}

/**
 * Generate Shopping List automatically from User Recipes
 */
export async function populateShoppingListFromRecipes(userId: string) {
  await ensureUserSampleRecipes(userId);

  const userRecipes = await db
    .select({
      id: recipes.id,
      name: recipes.name,
    })
    .from(recipes)
    .where(eq(recipes.userId, userId));

  if (userRecipes.length === 0) return [];

  const recipeIds = userRecipes.map((r) => r.id);
  const ingredients = await db
    .select()
    .from(recipeIngredients)
    .where(sql`${recipeIngredients.recipeId} IN ${recipeIds}`);

  // Aggregate amounts by ingredient name & category
  const aggregated = new Map<
    string,
    { name: string; amount: number; unit: string; category: string }
  >();

  for (const ing of ingredients) {
    const key = `${ing.name.toLowerCase()}_${ing.unit}`;
    const amountNum = parseFloat(ing.amount) || 1;
    if (aggregated.has(key)) {
      const prev = aggregated.get(key)!;
      prev.amount += amountNum;
    } else {
      aggregated.set(key, {
        name: ing.name,
        amount: amountNum,
        unit: ing.unit,
        category: ing.category,
      });
    }
  }

  const itemsToInsert = Array.from(aggregated.values());
  const created: (typeof shoppingItems.$inferSelect)[] = [];

  for (const item of itemsToInsert) {
    const [inserted] = await db
      .insert(shoppingItems)
      .values({
        userId,
        name: item.name,
        amount: item.amount.toFixed(2),
        unit: item.unit,
        category: item.category,
        isBought: false,
      })
      .returning();
    created.push(inserted);
  }

  return created;
}
