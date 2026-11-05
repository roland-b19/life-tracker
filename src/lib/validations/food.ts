import { z } from "zod";

export const logMealSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  name: z.string().min(1).max(120).trim(),
  calories: z.number().int().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(1000),
  isEstimated: z.boolean().default(false).optional(),
});

export const updateMetricsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  waterMl: z.number().int().min(0).max(20000).optional(),
  steps: z.number().int().min(0).max(100000).optional(),
  notes: z.string().max(255).optional().nullable(),
});

export const updateNutritionTargetsSchema = z.object({
  calories: z.number().int().min(500).max(10000),
  proteinGrams: z.number().int().min(20).max(500),
  carbsGrams: z.number().int().min(0).max(1000),
  fatGrams: z.number().int().min(0).max(400),
  waterMl: z.number().int().min(500).max(15000),
  steps: z.number().int().min(1000).max(100000),
});

export const createShoppingItemSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  amount: z.number().min(0.01).max(1000).default(1),
  unit: z.string().max(30).default("pcs"),
  category: z.enum(["meat", "produce", "dairy", "bakery", "pantry", "other"]).default("other"),
});

export const toggleShoppingItemSchema = z.object({
  itemId: z.string().uuid(),
  isBought: z.boolean(),
});

export type LogMealInput = z.infer<typeof logMealSchema>;
export type UpdateMetricsInput = z.infer<typeof updateMetricsSchema>;
export type UpdateNutritionTargetsInput = z.infer<typeof updateNutritionTargetsSchema>;
export type CreateShoppingItemInput = z.infer<typeof createShoppingItemSchema>;
export type ToggleShoppingItemInput = z.infer<typeof toggleShoppingItemSchema>;

export const shoppingFromRecipesSchema = z.object({
  keys: z.array(z.string().min(1).max(160)).min(1).max(200),
});
