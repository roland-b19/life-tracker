import { z } from "zod";
import { isoDate } from "./common";

export const categoryScopeSchema = z.enum(["wishlist", "personal", "business"]);
export type CategoryScope = z.infer<typeof categoryScopeSchema>;

/** Free text, so the user can add and rename categories; lower case so "Gifts" and "gifts" are one group. */
export const categorySchema = z.string().trim().toLowerCase().min(1).max(50);

/** A category the user manages; "other" is the built-in fallback and cannot be added, renamed or deleted. */
const managedCategorySchema = categorySchema.refine((c) => c !== "other", '"other" is built in.');

export const categoryNameSchema = z.object({ scope: categoryScopeSchema, name: managedCategorySchema });
export const renameCategorySchema = z.object({
  scope: categoryScopeSchema,
  from: managedCategorySchema,
  to: managedCategorySchema,
});

/** Undo of a rename or delete: what the change reported, sent back as it was. */
export const revertCategorySchema = z.object({
  scope: categoryScopeSchema,
  name: managedCategorySchema,
  current: categorySchema,
  sortOrder: z.number().int(),
  itemIds: z.array(z.string().uuid()).max(5000),
  dropCurrent: z.boolean(),
  before: z.array(z.object({ id: z.string().uuid(), placedAt: z.iso.datetime() })).max(5000).default([]),
  splits: z.array(z.object({ from: z.string().uuid(), to: z.string().uuid(), day: isoDate, endedOn: isoDate.nullable() })).max(5000).default([]),
});

/** The list's categories in their new order, top first. */
export const reorderCategoriesSchema = z.object({
  scope: categoryScopeSchema,
  names: z.array(managedCategorySchema).max(200).refine((n) => new Set(n).size === n.length, "Names must be unique."),
});
