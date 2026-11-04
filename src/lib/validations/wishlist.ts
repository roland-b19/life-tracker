import { z } from "zod";

export const createWishlistItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(120, "Name cannot exceed 120 chars").trim(),
  url: z
    .string()
    .url("Invalid URL format")
    .max(500, "URL cannot exceed 500 chars")
    .optional()
    .or(z.literal(""))
    .nullable(),
  estimatedPrice: z
    .coerce
    .number()
    .positive("Price must be greater than 0")
    .max(10000000, "Price exceeds maximum threshold"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

export type CreateWishlistItemInput = z.infer<typeof createWishlistItemSchema>;
