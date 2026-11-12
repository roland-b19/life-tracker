import { z } from "zod";
import { categorySchema } from "./categories";
import { isoDate } from "./common";

export const todoSpaceSchema = z.enum(["personal", "business"]);
// "none" for a one-off task, "daily" for a repeating one.
export const recurrencePatternSchema = z.enum(["none", "daily"]);

export const createTodoSchema = z.object({
  space: todoSpaceSchema.default("personal"),
  title: z.string().trim().min(1, "Title is required").max(150),
  isRecurring: z.boolean().default(false),
  recurrencePattern: recurrencePatternSchema.default("none"),
  dueDate: isoDate,
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)")
    .optional()
    .nullable(),
  // Only the daily list shows it; every task has one, "other" when it was never filed.
  category: categorySchema.default("other"),
});

export { isoDate };

/** Undo of a delete: the same row back, with its id and ticked days. */
export const restoreTodoSchema = createTodoSchema.extend({
  id: z.string().uuid(),
  isCompleted: z.boolean(),
  isCarriedOver: z.boolean(),
  completedAt: z.coerce.date().nullable().optional(), // when the box last changed, so Undo keeps the list order
  // shortcut: a repeating task ticked on more than 20 years of days cannot be restored, raise the cap if that ever matters.
  doneDates: z.array(isoDate).max(7500).default([]),
  createdAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 60_000, "Date cannot be in the future"),
  placedAt: z.coerce.date().optional(), // its place in the list, so Undo keeps the order
});

export { PLAN_AHEAD_DAYS } from "../rules";

export const toggleTodoSchema = z.object({
  id: z.string().uuid(),
  isCompleted: z.boolean(),
  currentDate: isoDate,
});

export const updateTodoSchema = z.object({
  id: z.string().uuid(),
  title: createTodoSchema.shape.title,
  reminderTime: createTodoSchema.shape.reminderTime,
  // Left out by the one-off form, which has no category: then the task keeps its own.
  category: categorySchema.optional(),
});

/** Moves a task to `dueDate` as a one-off task ("none"), or makes it a repeating one. */
export const moveTodoSchema = z.object({
  id: z.string().uuid(),
  recurrencePattern: recurrencePatternSchema,
  dueDate: isoDate,
  // The edits made in the same step.
  title: createTodoSchema.shape.title.optional(),
  reminderTime: createTodoSchema.shape.reminderTime,
  category: categorySchema.optional(),
});

export const deleteTodoSchema = z.object({ id: z.string().uuid() });

export const pushSubscriptionSchema = z.object({
  // https only: the push sender (Azure) will call this address, so it must not be http or any other scheme.
  endpoint: z.url({ protocol: /^https$/ }).max(500),
  p256dhKey: z.string().trim().min(1).max(255),
  authKey: z.string().trim().min(1).max(255),
});

export type TodoSpace = z.infer<typeof todoSpaceSchema>;
// Callers that never file a task (tests, the carry-over) can leave the category out: it is then "other".
export type CreateTodoInput = Omit<z.infer<typeof createTodoSchema>, "category"> & { category?: string };
export type RestoreTodoInput = z.input<typeof restoreTodoSchema>;
export type ToggleTodoInput = z.infer<typeof toggleTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
export type MoveTodoInput = z.infer<typeof moveTodoSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

