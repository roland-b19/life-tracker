import { addDays } from "../format-date";
import { z } from "zod";
import { isoDate } from "./common";

export const logMealSchema = z.object({
  date: isoDate,
  name: z.string().min(1).max(120).trim(),
  calories: z.number().int().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(1000),
  isEstimated: z.boolean().default(false).optional(),
});

export const updateMetricsSchema = z.object({
  date: isoDate,
  waterMl: z.number().int().min(0).max(20000).optional(),
  steps: z.number().int().min(0).max(100000).optional(),
  notes: z.string().max(255).optional().nullable(),
});

export const day = isoDate;

/** A day's water (ml) or steps; `previousDate` moves an existing value to `date`. */
export const saveDailyMetricSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("water"), date: day, value: z.number().int().min(1).max(20000), previousDate: day.optional() }),
  z.object({ kind: z.literal("steps"), date: day, value: z.number().int().min(1).max(200000), previousDate: day.optional() }),
]);

/** Water and steps can be added or changed for today and yesterday only; older days are history. */
export const metricDayEditable = (date: string, today: string) => date <= today && date >= addDays(today, -1);

export const clearDailyMetricSchema = z.object({ kind: z.enum(["water", "steps"]), date: day });

export const updateNutritionTargetsSchema = z.object({
  calories: z.number().int().min(500).max(10000),
  proteinGrams: z.number().int().min(20).max(500),
  carbsGrams: z.number().int().min(0).max(1000),
  fatGrams: z.number().int().min(0).max(400),
  waterMl: z.number().int().min(500).max(15000),
  steps: z.number().int().min(1000).max(100000),
});

/** Free text, so the user can add and rename categories; lower case so "Dairy" and "dairy" are one group. */
export const shoppingCategorySchema = z.string().trim().toLowerCase().min(1).max(50);

export const createShoppingItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().min(0.01).max(1000).default(1),
  unit: z.string().trim().max(30).default("pcs"),
  category: shoppingCategorySchema.default("other"),
});

export const updateShoppingItemSchema = createShoppingItemSchema.extend({ itemId: z.string().uuid() });

/** A category the user manages; "other" is the built-in fallback and cannot be added, renamed or deleted. */
const managedCategorySchema = shoppingCategorySchema.refine((c) => c !== "other", "\"other\" is built in.");
export const shoppingCategoryNameSchema = z.object({ name: managedCategorySchema });
export const reorderShoppingCategoriesSchema = z.object({
  names: z.array(managedCategorySchema).max(200).refine((n) => new Set(n).size === n.length, "Names must be unique."),
});
export const renameShoppingCategorySchema = z.object({ from: managedCategorySchema, to: managedCategorySchema });

/** Undo of a category rename or delete: what the change reported, sent back as it was. */
export const revertShoppingCategorySchema = z.object({
  name: managedCategorySchema,
  current: shoppingCategorySchema,
  sortOrder: z.number().int(),
  itemIds: z.array(z.string().uuid()).max(5000),
  dropCurrent: z.boolean(),
});

export const restoreShoppingItemsSchema = z.object({ itemIds: z.array(z.string().uuid()).min(1).max(500) });

export const toggleShoppingItemSchema = z.object({
  itemId: z.string().uuid(),
  isBought: z.boolean(),
});

export type LogMealInput = z.infer<typeof logMealSchema>;
export type UpdateNutritionTargetsInput = z.infer<typeof updateNutritionTargetsSchema>;
export type CreateShoppingItemInput = z.infer<typeof createShoppingItemSchema>;
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;
