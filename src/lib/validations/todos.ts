import { z } from "zod";

export const todoSpaceSchema = z.enum(["personal", "business"]);
export const recurrencePatternSchema = z.enum(["daily", "weekly", "none"]);

export const createTodoSchema = z.object({
  space: todoSpaceSchema.default("personal"),
  title: z.string().min(1, "Title is required").max(150).trim(),
  isRecurring: z.boolean().default(false),
  recurrencePattern: recurrencePatternSchema.default("none"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)")
    .optional()
    .nullable(),
});

export const toggleTodoSchema = z.object({
  id: z.string().uuid(),
  isCompleted: z.boolean(),
  currentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
});

export const deleteTodoSchema = z.object({
  id: z.string().uuid(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(500),
  p256dhKey: z.string().min(1).max(255),
  authKey: z.string().min(1).max(255),
});

export type TodoSpace = z.infer<typeof todoSpaceSchema>;
export type RecurrencePattern = z.infer<typeof recurrencePatternSchema>;
export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type ToggleTodoInput = z.infer<typeof toggleTodoSchema>;
export type DeleteTodoInput = z.infer<typeof deleteTodoSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
