import { z } from "zod";

export const createBusinessIncomeSchema = z.object({
  amount: z
    .coerce
    .number()
    .positive("Amount must be greater than 0")
    .max(100000000, "Amount exceeds maximum limit"),
  category: z.string().min(1, "Category is required").max(50).trim().default("Sales"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  note: z.string().max(255, "Note cannot exceed 255 chars").trim().optional().or(z.literal("")).nullable(),
});

export type CreateBusinessIncomeInput = z.infer<typeof createBusinessIncomeSchema>;
