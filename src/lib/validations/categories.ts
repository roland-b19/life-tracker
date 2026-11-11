import { z } from "zod";

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
