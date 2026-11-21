import { z } from "zod";
import { categorySchema } from "./categories";
import { toISODate } from "@/lib/format-date";
import { isoDate, newId, uuid, visible } from "./common";

/** One day of water holds at most this much; quick taps and totals stop here. */
export const MAX_WATER_ML = 20000;
/** The most steps a day (or a step goal) can hold: the log and the goal share one limit. */
export const MAX_STEPS = 200000;

const mealFields = z.object({
  date: isoDate,
  // The manual form has no name field (meals are not listed any more); the assistant still names its own.
  name: z.string().trim().min(1).max(120).refine(visible, "Name is required").default("Meal"),
  calories: z.number().int().min(0).max(10000),
  protein: z.number().min(0).max(1000),
  carbs: z.number().min(0).max(1000),
  fat: z.number().min(0).max(1000),
  isEstimated: z.boolean().default(false).optional(),
});

/**
 * Whether a meal holds anything once stored: its calories, or a macro that is not 0 at the one decimal the table keeps
 * (0.04 g is stored as 0.0). The form's Save asks the same, so the page and the server never disagree.
 */
export const mealHasValue = (meal: { calories: number; protein: number; carbs: number; fat: number }) =>
  meal.calories > 0 || [meal.protein, meal.carbs, meal.fat].some((grams) => Math.round(grams * 10) > 0);

export const logMealSchema = mealFields.extend({ id: newId }).refine(mealHasValue, "Enter calories or a macro above 0.");

/** Undo of a delete: the same meal, under its old id and time. */
export const restoreMealSchema = mealFields.extend({ id: uuid, createdAt: z.string().datetime().optional() });

const WEIGHT_RANGE = "The weight must be between 20 and 500 kg.";

/** Whether a number has at most two decimals (the tables keep two). 78.4 * 100 is 7840.000000000001, so it compares against the nearest hundredth instead of Number.isInteger. */
const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const TWO_DECIMALS = "Maximum two decimal places.";

/** One weigh-in a day: saving a day that already has one replaces its kilograms. */
export const logWeightSchema = z
  .object({
    id: newId,
    // A weigh-in is a measurement: it cannot be in the future.
    date: isoDate.refine((date) => date <= toISODate(), "The date cannot be in the future."),
    kilograms: z
      .number("Please enter a valid weight.")
      .min(20, WEIGHT_RANGE)
      .max(500, WEIGHT_RANGE)
      .refine(twoDecimals, TWO_DECIMALS),
  })
  .strict();

/** Undo of a delete: the same weigh-in, under its old id. */
export const restoreWeightSchema = logWeightSchema.extend({ id: uuid });

const targetFields = {
  calories: z.number().int().min(500).max(10000),
  proteinGrams: z.number().int().min(20).max(500),
  carbsGrams: z.number().int().min(0).max(1000),
  fatGrams: z.number().int().min(0).max(400),
  waterMl: z.number().int().min(500).max(15000),
  steps: z.number().int().min(1000).max(MAX_STEPS),
};
const NOTHING_TO_SAVE = "Nothing to save.";
const anySet = (values: unknown[]) => values.some((value) => value !== undefined);

/** The answer when a stored number is no longer the one the screen showed: another device changed it first. */
export const CHANGED_ELSEWHERE = "This changed on another device. Check the new value and try again.";

/**
 * One number an edit changes: the value the screen showed (`from`) and the new one (`to`). The server writes `to` only
 * while the stored value still equals `from`, so a change made on another device in between is never lost (D-040).
 */
export type ValueChange = { from: number; to: number };
const valueChange = (to: z.ZodNumber) => z.object({ from: z.number().int().min(0).max(2 ** 31 - 1), to }).strict();

const goalChanges = Object.fromEntries(
  Object.entries(targetFields).map(([key, range]) => [key, valueChange(range).optional()]),
) as { [K in keyof typeof targetFields]: z.ZodOptional<ReturnType<typeof valueChange>> };

/** The daily goals: an edit sends only the ones it changes, each with the value it showed, and only those are written. */
export const updateNutritionTargetsSchema = z.object(goalChanges).refine((goals) => anySet(Object.values(goals)), NOTHING_TO_SAVE);

/**
 * The day's water or steps and its goal, from one dialog: each is sent only when it changed, and both are written or
 * neither. The amount is the day's total (a quick tap sends the total it showed and the new one).
 */
export const setWaterSchema = z
  .object({ date: isoDate, waterMl: valueChange(z.number().int().min(0).max(MAX_WATER_ML)).optional(), goal: valueChange(targetFields.waterMl).optional() })
  .refine((v) => anySet([v.waterMl, v.goal]), NOTHING_TO_SAVE);
export const updateStepsSchema = z
  .object({ date: isoDate, steps: valueChange(z.number().int().min(0).max(MAX_STEPS)).optional(), goal: valueChange(targetFields.steps).optional() })
  .refine((v) => anySet([v.steps, v.goal]), NOTHING_TO_SAVE);

/** Free text, so the user can add and rename categories; lower case so "Dairy" and "dairy" are one group. */
export const shoppingCategorySchema = categorySchema;

/** The most one shopping item can hold: an add or a merge that would pass it is refused. */
export const MAX_SHOPPING_AMOUNT = 1000;
/** How many names each of the two shopping lists (categories, units) holds at most. */
export const MAX_SHOPPING_NAMES = 200;
/** The most items one Clear bought takes off the list, and its Undo puts back, at once. */
export const MAX_CLEARED = 5000;
/** The answer to an edit of an item that has left the list (deleted on another device): the form closes. */
export const SHOPPING_ITEM_GONE = "This item is no longer on the list.";

const shoppingAmount = z.number().min(0.01).max(MAX_SHOPPING_AMOUNT).refine(twoDecimals, TWO_DECIMALS);
const shoppingItemFields = z.object({
  name: z.string().trim().min(1).max(120).refine(visible, "Name is required"),
  amount: shoppingAmount.default(1),
  unit: z.string().trim().toLowerCase().min(1).max(30).default("pcs"),
  category: shoppingCategorySchema.default("other"),
});

export const addShoppingItemSchema = shoppingItemFields.extend({ id: newId });

export const updateShoppingItemSchema = shoppingItemFields.extend({
  itemId: uuid,
  // Only Undo sends these, to put back the bought state an "add again" reset.
  isBought: z.boolean().optional(),
  checkedAt: z.coerce.date().nullable().optional(),
});

/** The two lists of names the user manages on the shopping list; "other" and "pcs" are their built-in fallbacks. */
const shoppingKindSchema = z.enum(["category", "unit"]).default("category");
type ShoppingKind = z.infer<typeof shoppingKindSchema>;

/** Names the user manages: never the list's built-in fallback, and a unit fits its column (30 characters). */
const managed = <T extends { kind: ShoppingKind }>(schema: z.ZodType<T>, names: (v: T) => string[]) =>
  schema
    .refine((v) => v.kind !== "category" || !names(v).includes("other"), '"other" is built in.')
    .refine((v) => v.kind !== "unit" || !names(v).includes("pcs"), '"pcs" is built in.')
    .refine((v) => v.kind !== "unit" || names(v).every((n) => n.length <= 30), "Too long (max 30)");

export const shoppingCategoryNameSchema = managed(z.object({ kind: shoppingKindSchema, name: shoppingCategorySchema }), (v) => [v.name]);
export const reorderShoppingCategoriesSchema = managed(
  z.object({
    kind: shoppingKindSchema,
    names: z.array(shoppingCategorySchema).max(MAX_SHOPPING_NAMES).refine((n) => new Set(n).size === n.length, "Names must be unique."),
  }),
  (v) => v.names,
);
export const renameShoppingCategorySchema = managed(
  z.object({ kind: shoppingKindSchema, from: shoppingCategorySchema, to: shoppingCategorySchema }),
  (v) => [v.from, v.to],
).refine((v) => v.from !== v.to, { message: "That is already its name.", path: ["to"] });

/**
 * Undo of a rename or delete: what the change reported, sent back as it was. A unit change also reports the rows it
 * merged into another (`merges`: the target's values before) and the amounts it converted (`amounts`: the old ones).
 */
export const revertShoppingCategorySchema = managed(
  z.object({
    kind: shoppingKindSchema,
    name: shoppingCategorySchema,
    current: shoppingCategorySchema,
    sortOrder: z.number().int(),
    itemIds: z.array(uuid).max(MAX_CLEARED),
    dropCurrent: z.boolean(),
    merges: z
      .array(z.object({ id: uuid, into: uuid, amount: shoppingAmount, category: shoppingCategorySchema, isBought: z.boolean() }))
      .max(MAX_CLEARED)
      .default([]),
    amounts: z.array(z.object({ id: uuid, amount: shoppingAmount })).max(MAX_CLEARED).default([]),
  }),
  (v) => [v.name],
);

/** A tick, or its Undo: Undo sends the time the box had before (`checkedAt`), so the row goes back to its place. */
export const toggleShoppingItemSchema = z.object({ itemId: uuid, isBought: z.boolean(), checkedAt: z.coerce.date().nullable().optional() });

export const restoreShoppingItemsSchema = z.object({ itemIds: z.array(uuid).min(1).max(MAX_CLEARED) });

export type RestoreMealInput = z.infer<typeof restoreMealSchema>;
export type LogWeightInput = z.infer<typeof logWeightSchema>;
export type RestoreWeightInput = z.infer<typeof restoreWeightSchema>;
export type LogMealInput = z.infer<typeof logMealSchema>;
export type UpdateNutritionTargetsInput = z.infer<typeof updateNutritionTargetsSchema>;
export type AddShoppingItemInput = z.infer<typeof addShoppingItemSchema>;
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;
export type RevertShoppingCategoryInput = Omit<z.infer<typeof revertShoppingCategorySchema>, "kind">;
