import { z } from "zod";

export const createWishlistItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(120, "Name cannot exceed 120 chars").trim(),
  // Free text on purpose: a store name is as valid as a URL.
  url: z.string().trim().max(500, "Link cannot exceed 500 chars").optional().nullable(),
  estimatedPrice: z
    .coerce
    .number()
    .positive("Price must be greater than 0")
    .max(10000000, "Price exceeds maximum threshold"),
});

export type Priority = "low" | "medium" | "high";

/** Priority is derived from the price: under 250 low, under 750 medium, otherwise high. */
export function priorityForPrice(price: number): Priority {
  return price < 250 ? "low" : price < 750 ? "medium" : "high";
}

export type CreateWishlistItemInput = z.infer<typeof createWishlistItemSchema>;
