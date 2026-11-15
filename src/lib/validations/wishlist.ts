import { z } from "zod";
import { categorySchema } from "./categories";
import { visible } from "./common";

export const createWishlistItemSchema = z.object({
  // trim() leaves zero-width characters, so a name of only those would look empty on screen.
  name: z.string().trim().min(1, "Name is required").max(120, "Name cannot exceed 120 chars").refine(visible, "Name is required"),
  // Free text on purpose: a store name is as valid as a URL.
  url: z.string().trim().max(500, "Link cannot exceed 500 chars").optional().nullable(),
  estimatedPrice: z
    .coerce
    .number()
    .min(0.01, "Price must be at least 0.01")
    .max(10000000, "Price exceeds maximum threshold")
    // Cents, as stored: the priority must be derived from the price the row actually holds (249.999 is stored as 250.00).
    .transform((n) => Math.round(n * 100) / 100),
  category: categorySchema.default("other"),
});

/** Undo of a delete: the same row back, so it keeps its id and its place in the list. */
export const restoreWishlistItemSchema = createWishlistItemSchema.extend({
  id: z.string().uuid(),
  createdAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 60_000, "Date cannot be in the future"),
});

export { priorityForPrice, type Priority } from "../rules";

export type CreateWishlistItemInput = z.input<typeof createWishlistItemSchema>;
export type RestoreWishlistItemInput = z.input<typeof restoreWishlistItemSchema>;
