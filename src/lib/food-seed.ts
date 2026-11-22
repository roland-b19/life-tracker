import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { nutritionTargets } from "@/db/schema";

const DEFAULT_NUTRITION_TARGETS = {
  calories: 3350,
  proteinGrams: 170,
  carbsGrams: 300,
  fatGrams: 80,
  waterMl: 3000,
  steps: 10000,
};

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
