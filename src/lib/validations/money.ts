import { z } from "zod";

export const expenseSpaceSchema = z.enum(["personal", "business"]);

export const logExpenseSchema = z.object({
  space: expenseSpaceSchema.default("personal"),
  amount: z.coerce.number().positive("Amount must be greater than 0").max(100000000),
  currency: z.literal("RON").default("RON"),
  category: z.string().min(1, "Category is required").max(50).trim(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  notes: z.string().max(255).optional().nullable(),
});

export const deleteExpenseSchema = z.object({
  id: z.string().uuid(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required").max(50).trim(),
  space: expenseSpaceSchema.default("personal"),
  icon: z.string().max(30).optional().nullable(),
});

export const getExpensesFilterSchema = z.object({
  space: expenseSpaceSchema.default("personal"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Invalid month format (YYYY-MM)").optional(),
});

export type ExpenseSpace = z.infer<typeof expenseSpaceSchema>;
export type LogExpenseInput = z.infer<typeof logExpenseSchema>;
export type DeleteExpenseInput = z.infer<typeof deleteExpenseSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type GetExpensesFilterInput = z.infer<typeof getExpensesFilterSchema>;
