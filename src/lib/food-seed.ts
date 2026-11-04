import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  nutritionTargets,
  recipes,
  recipeIngredients,
} from "@/db/schema";

export const DEFAULT_NUTRITION_TARGETS = {
  calories: 3350,
  proteinGrams: 170,
  carbsGrams: 300,
  fatGrams: 80,
  waterMl: 3000,
  steps: 10000,
};

export const SAMPLE_RECIPES = [
  {
    name: "Chicken Breast & Basmati Rice",
    description: "Lean high-protein staple with clean carbs",
    calories: 620,
    protein: "55.0",
    carbs: "75.0",
    fat: "10.0",
    ingredients: [
      { name: "Chicken breast", amount: "250.00", unit: "g", category: "meat" },
      { name: "Basmati rice (dry)", amount: "100.00", unit: "g", category: "pantry" },
      { name: "Olive oil", amount: "10.00", unit: "ml", category: "pantry" },
      { name: "Broccoli florets", amount: "150.00", unit: "g", category: "produce" },
    ],
  },
  {
    name: "Power Oatmeal & Whey",
    description: "Pre-workout energy with complex carbs and fast protein",
    calories: 550,
    protein: "45.0",
    carbs: "70.0",
    fat: "9.0",
    ingredients: [
      { name: "Rolled oats", amount: "80.00", unit: "g", category: "pantry" },
      { name: "Whey protein isolate", amount: "35.00", unit: "g", category: "pantry" },
      { name: "Banana", amount: "1.00", unit: "pcs", category: "produce" },
      { name: "Almond milk", amount: "200.00", unit: "ml", category: "dairy" },
    ],
  },
  {
    name: "Ground Beef & Sweet Potato",
    description: "Dense post-workout meal with micronutrients",
    calories: 680,
    protein: "50.0",
    carbs: "65.0",
    fat: "22.0",
    ingredients: [
      { name: "Lean ground beef (5%)", amount: "200.00", unit: "g", category: "meat" },
      { name: "Sweet potato", amount: "300.00", unit: "g", category: "produce" },
      { name: "Bell pepper", amount: "1.00", unit: "pcs", category: "produce" },
    ],
  },
  {
    name: "Greek Yogurt Bowl",
    description: "Slow-digesting casein protein snack",
    calories: 380,
    protein: "35.0",
    carbs: "45.0",
    fat: "4.0",
    ingredients: [
      { name: "Greek yogurt 0%", amount: "300.00", unit: "g", category: "dairy" },
      { name: "Blueberries", amount: "100.00", unit: "g", category: "produce" },
      { name: "Honey", amount: "20.00", unit: "g", category: "pantry" },
    ],
  },
];

export async function ensureUserNutritionTargets(userId: string) {
  const existing = await db
    .select()
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [created] = await db
    .insert(nutritionTargets)
    .values({
      userId,
      ...DEFAULT_NUTRITION_TARGETS,
    })
    .onConflictDoNothing()
    .returning();

  if (created) {
    return created;
  }

  const [fallback] = await db
    .select()
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId))
    .limit(1);

  return fallback;
}

export async function ensureUserSampleRecipes(userId: string) {
  const existing = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(eq(recipes.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  for (const sample of SAMPLE_RECIPES) {
    const [recipe] = await db
      .insert(recipes)
      .values({
        userId,
        name: sample.name,
        description: sample.description,
        calories: sample.calories,
        protein: sample.protein,
        carbs: sample.carbs,
        fat: sample.fat,
      })
      .returning({ id: recipes.id });

    for (const ing of sample.ingredients) {
      await db.insert(recipeIngredients).values({
        recipeId: recipe.id,
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        category: ing.category,
      });
    }
  }
}
