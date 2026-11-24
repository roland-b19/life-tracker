import { z } from "zod";
import { categorySchema } from "./categories";
import { roundTo } from "@/lib/number-format";
import { FUTURE_DATE, newId, uuid, visible } from "./common";

/** The refusal for an item that is not there (deleted on another device, or another user's): the client drops its row. */
export const WISHLIST_ITEM_GONE = "This item no longer exists.";

const wishlistFields = z.object({
  // trim() leaves zero-width characters, so a name of only those would look empty on screen.
  // Too long is told with the shared "Too long (max N)" (validations/result.ts), here and for the link.
  name: z.string().trim().min(1, "Name is required").max(120).refine(visible, "Name is required"),
  // Free text on purpose: a store name is as valid as a URL.
  url: z.string().trim().max(500).optional().nullable(),
  estimatedPrice: z
    .coerce
    .number()
    .min(0.01, "Price must be at least 0.01")
    .max(10000000, "Price exceeds maximum threshold")
    // Cents, as stored: the priority must be derived from the price the row actually holds (249.999 is stored as 250.00).
    .transform((n) => roundTo(n, 2)),
  category: categorySchema.default("other"),
});

/** A new item, with the id the add form made when it opened (D-040). */
export const addWishlistItemSchema = wishlistFields.extend({ id: newId });

/** An edit sends the item's id and only the fields it changed (D-040); the others keep what is stored. A null or empty link clears it. */
export const updateWishlistItemSchema = z.object({
  id: uuid,
  name: wishlistFields.shape.name.optional(),
  url: wishlistFields.shape.url,
  estimatedPrice: wishlistFields.shape.estimatedPrice.optional(),
  category: categorySchema.optional(),
});

/** Undo of a delete: the same row back, so it keeps its id and its place in the list. */
export const restoreWishlistItemSchema = wishlistFields.extend({
  id: uuid,
  createdAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 60_000, FUTURE_DATE),
});

export type AddWishlistItemInput = z.infer<typeof addWishlistItemSchema>;
export type UpdateWishlistItemInput = z.infer<typeof updateWishlistItemSchema>;
export type RestoreWishlistItemInput = z.infer<typeof restoreWishlistItemSchema>;
