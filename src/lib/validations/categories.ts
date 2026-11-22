import { z } from "zod";
import { uuid, visible } from "./common";

const categoryScopeSchema = z.enum(["wishlist", "personal", "business"]);
export type CategoryScope = z.infer<typeof categoryScopeSchema>;

/** Free text, so the user can add and rename categories; lower case so "Gifts" and "gifts" are one group. */
export const categorySchema = z.string().trim().toLowerCase().min(1, "Name is required").max(50).refine(visible, "Name is required");

/** The answer when a category the page showed is gone (deleted or renamed elsewhere). */
export const CATEGORY_GONE = "Category not found.";

/** A category the user manages; "other" is the built-in fallback and cannot be added, renamed or deleted. */
const managedCategorySchema = categorySchema.refine((c) => c !== "other", '"other" is built in');

export const categoryNameSchema = z.object({ scope: categoryScopeSchema, name: managedCategorySchema });
export const renameCategorySchema = z
  .object({ scope: categoryScopeSchema, from: managedCategorySchema, to: managedCategorySchema })
  .refine((r) => r.from !== r.to, { message: "That is already its name", path: ["to"] });

/** Undo of a rename or delete: what the change reported, sent back as it was. */
export const revertCategorySchema = z.object({
  scope: categoryScopeSchema,
  name: managedCategorySchema,
  current: categorySchema,
  sortOrder: z.number().int(),
  itemIds: z.array(uuid).max(5000),
  dropCurrent: z.boolean(),
  before: z.array(z.object({ id: uuid, placedAt: z.iso.datetime() })).max(5000).default([]),
});

/** The list's categories in their new order, top first. */
export const reorderCategoriesSchema = z.object({
  scope: categoryScopeSchema,
  names: z.array(managedCategorySchema).max(200).refine((n) => new Set(n).size === n.length, "Names must be unique"),
});
