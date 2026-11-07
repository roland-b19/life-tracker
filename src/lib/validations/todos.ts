import { z } from "zod";

export const todoSpaceSchema = z.enum(["personal", "business"]);
// "none" for a one-off task; "daily", or "days:1,3,5" for chosen ISO weekdays (1 = Monday). Fits varchar(20).
export const recurrencePatternSchema = z.string().regex(/^(none|daily|days:[1-7](,[1-7]){0,6})$/, "Invalid repeat pattern");

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

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)");

/** Undo of a delete: the same row back, with its id and ticked days. */
export const restoreTodoSchema = createTodoSchema.extend({
  id: z.string().uuid(),
  isCompleted: z.boolean(),
  isCarriedOver: z.boolean(),
  // shortcut: a repeating task ticked on more than 20 years of days cannot be restored, raise the cap if that ever matters.
  doneDates: z.array(isoDate).max(7500).default([]),
  createdAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 60_000, "Date cannot be in the future"),
});

/** How far ahead one-off tasks can be planned. */
export const PLAN_AHEAD_DAYS = 7;

/** Dev builds may also edit and plan past days, for testing; never in production. Ticking past days is always allowed. */
export const DEV_EDIT_PAST = process.env.NODE_ENV === "development";

export const toggleTodoSchema = z.object({
  id: z.string().uuid(),
  isCompleted: z.boolean(),
  currentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
});

export const updateTodoSchema = z.object({
  id: z.string().uuid(),
  title: createTodoSchema.shape.title,
  reminderTime: createTodoSchema.shape.reminderTime,
  /** Only applied to repeating tasks. */
  recurrencePattern: recurrencePatternSchema.optional(),
});

/** Moves a task to `dueDate` as a one-off task ("none"), or makes it a repeating one. */
export const moveTodoSchema = z.object({
  id: z.string().uuid(),
  recurrencePattern: recurrencePatternSchema,
  dueDate: isoDate,
});

export const deleteTodoSchema = z.object({
  id: z.string().uuid(),
  day: isoDate.optional(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(500),
  p256dhKey: z.string().min(1).max(255),
  authKey: z.string().min(1).max(255),
});

export type TodoSpace = z.infer<typeof todoSpaceSchema>;
export type RecurrencePattern = z.infer<typeof recurrencePatternSchema>;
export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type RestoreTodoInput = z.input<typeof restoreTodoSchema>;
export type ToggleTodoInput = z.infer<typeof toggleTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
export type MoveTodoInput = z.infer<typeof moveTodoSchema>;
export type DeleteTodoInput = z.infer<typeof deleteTodoSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

