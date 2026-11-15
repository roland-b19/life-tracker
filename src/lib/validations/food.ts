import { z } from "zod";
import { isoDate, visible } from "./common";

/** One day of water holds at most this much; quick taps and totals stop here. */
export const MAX_WATER_ML = 20000;
/** The most steps a day (or a step goal) can hold: the log and the goal share one limit. */
export const MAX_STEPS = 200000;

export const logMealSchema = z.object({
  date: isoDate,
  // The manual form has no name field (meals are not listed any more); the assistant still names its own.
  name: z.string().trim().min(1).max(120).refine(visible, "Name is required").default("Meal"),
  calories: z.number().int().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(1000),
  isEstimated: z.boolean().default(false).optional(),
});

export const updateMetricsSchema = z.object({
  date: isoDate,
  waterMl: z.number().int().min(0).max(20000).optional(),
  steps: z.number().int().min(0).max(MAX_STEPS).optional(),
  notes: z.string().max(255).optional().nullable(),
});

export { metricDayEditable } from "../rules";

export const updateNutritionTargetsSchema = z.object({
  calories: z.number().int().min(500).max(10000),
  proteinGrams: z.number().int().min(20).max(500),
  carbsGrams: z.number().int().min(0).max(1000),
  fatGrams: z.number().int().min(0).max(400),
  waterMl: z.number().int().min(500).max(15000),
  steps: z.number().int().min(1000).max(MAX_STEPS),
});

/** Free text, so the user can add and rename categories; lower case so "Dairy" and "dairy" are one group. */
export const shoppingCategorySchema = z.string().trim().toLowerCase().min(1).max(50).refine(visible, "Name is required");

export const createShoppingItemSchema = z.object({
  name: z.string().trim().min(1).max(120).refine(visible, "Name is required"),
  amount: z.number().min(0.01).max(1000).default(1),
  unit: z.string().trim().toLowerCase().min(1).max(30).default("pcs"),
  category: shoppingCategorySchema.default("other"),
});

export const updateShoppingItemSchema = createShoppingItemSchema.extend({
  itemId: z.string().uuid(),
  // Only Undo sends these, to put back the bought state an "add again" reset.
  isBought: z.boolean().optional(),
  checkedAt: z.coerce.date().nullable().optional(),
});

/** The two lists of names the user manages on the shopping list; "other" and "pcs" are their built-in fallbacks. */
const shoppingKindSchema = z.enum(["category", "unit"]).default("category");
const FALLBACK = { category: "other", unit: "pcs" } as const;

/** A name the user manages: not the built-in fallback, and short enough for the column it ends up in (units: 30). */
const managed = <T extends { kind: "category" | "unit" }>(v: T, names: string[]) =>
  names.every((n) => n !== FALLBACK[v.kind] && (v.kind === "category" || n.length <= 30));
const builtIn = "\"other\" and \"pcs\" are built in, and a unit has at most 30 characters.";

export const shoppingCategoryNameSchema = z.object({ kind: shoppingKindSchema, name: shoppingCategorySchema }).refine((v) => managed(v, [v.name]), builtIn);
export const reorderShoppingCategoriesSchema = z
  .object({ kind: shoppingKindSchema, names: z.array(shoppingCategorySchema).max(200).refine((n) => new Set(n).size === n.length, "Names must be unique.") })
  .refine((v) => managed(v, v.names), builtIn);
export const renameShoppingCategorySchema = z
  .object({ kind: shoppingKindSchema, from: shoppingCategorySchema, to: shoppingCategorySchema })
  .refine((v) => managed(v, [v.from, v.to]), builtIn);

/** Undo of a rename or delete: what the change reported, sent back as it was. */
export const revertShoppingCategorySchema = z
  .object({
    kind: shoppingKindSchema,
    name: shoppingCategorySchema,
    current: shoppingCategorySchema,
    sortOrder: z.number().int(),
    itemIds: z.array(z.string().uuid()).max(5000),
    dropCurrent: z.boolean(),
  })
  .refine((v) => managed(v, [v.name]), builtIn);

export const restoreShoppingItemsSchema = z.object({ itemIds: z.array(z.string().uuid()).min(1).max(500) });

export const toggleShoppingItemSchema = z.object({
  itemId: z.string().uuid(),
  isBought: z.boolean(),
});

export type LogMealInput = z.infer<typeof logMealSchema>;
export type UpdateNutritionTargetsInput = z.infer<typeof updateNutritionTargetsSchema>;
export type CreateShoppingItemInput = z.infer<typeof createShoppingItemSchema>;
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;
