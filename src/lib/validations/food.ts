import { z } from "zod";
import { categorySchema } from "./categories";
import { toISODate } from "../format-date";
import { isoDate, uuid, visible } from "./common";

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

/** Undo of a delete: the same meal, under its old id and time. */
export const restoreMealSchema = logMealSchema.extend({ id: uuid, createdAt: z.string().datetime().optional() });

/** One weigh-in a day: saving a day that already has one replaces its kilograms. */
export const logWeightSchema = z
  .object({
    // A weigh-in is a measurement: it cannot be in the future.
    date: isoDate.refine((date) => date <= toISODate(), "The date cannot be in the future."),
    kilograms: z
      .number("Please enter a valid weight.")
      .finite("Please enter a valid weight.")
      .min(20, "The weight must be between 20 and 500 kg.")
      .max(500, "The weight must be between 20 and 500 kg.")
      // 78.4 * 100 is 7840.000000000001, so compare against the nearest hundredth instead of Number.isInteger.
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, "Maximum two decimal places."),
  })
  .strict();

/** Undo of a delete: the same weigh-in, under its old id. */
export const restoreWeightSchema = logWeightSchema.extend({ id: uuid });

/** Quick taps (negative, for Undo) and exact totals on a day; both stop at the same ceiling. */
export const addWaterSchema = z.object({ date: isoDate, amountMl: z.number().int().min(-MAX_WATER_ML).max(MAX_WATER_ML) });
export const setWaterSchema = z.object({ date: isoDate, waterMl: z.number().int().min(0).max(MAX_WATER_ML) });
export const updateStepsSchema = z.object({ date: isoDate, steps: z.number().int().min(0).max(MAX_STEPS) });

export const updateNutritionTargetsSchema = z.object({
  calories: z.number().int().min(500).max(10000),
  proteinGrams: z.number().int().min(20).max(500),
  carbsGrams: z.number().int().min(0).max(1000),
  fatGrams: z.number().int().min(0).max(400),
  waterMl: z.number().int().min(500).max(15000),
  steps: z.number().int().min(1000).max(MAX_STEPS),
});

/** Free text, so the user can add and rename categories; lower case so "Dairy" and "dairy" are one group. */
export const shoppingCategorySchema = categorySchema;

export const createShoppingItemSchema = z.object({
  name: z.string().trim().min(1).max(120).refine(visible, "Name is required"),
  amount: z.number().min(0.01).max(1000).default(1),
  unit: z.string().trim().toLowerCase().min(1).max(30).default("pcs"),
  category: shoppingCategorySchema.default("other"),
});

export const updateShoppingItemSchema = createShoppingItemSchema.extend({
  itemId: uuid,
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
  .refine((v) => managed(v, [v.from, v.to]), builtIn)
  .refine((v) => v.from !== v.to, { message: "That is already its name.", path: ["to"] });

/** Undo of a rename or delete: what the change reported, sent back as it was. */
export const revertShoppingCategorySchema = z
  .object({
    kind: shoppingKindSchema,
    name: shoppingCategorySchema,
    current: shoppingCategorySchema,
    sortOrder: z.number().int(),
    itemIds: z.array(uuid).max(5000),
    dropCurrent: z.boolean(),
  })
  .refine((v) => managed(v, [v.name]), builtIn);

export const toggleShoppingItemSchema = z.object({ itemId: uuid, isBought: z.boolean() });

export const restoreShoppingItemsSchema = z.object({ itemIds: z.array(uuid).min(1).max(500) });

export type RestoreMealInput = z.infer<typeof restoreMealSchema>;
export type LogWeightInput = z.infer<typeof logWeightSchema>;
export type RestoreWeightInput = z.infer<typeof restoreWeightSchema>;
export type LogMealInput = z.infer<typeof logMealSchema>;
export type UpdateNutritionTargetsInput = z.infer<typeof updateNutritionTargetsSchema>;
export type CreateShoppingItemInput = z.infer<typeof createShoppingItemSchema>;
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;
