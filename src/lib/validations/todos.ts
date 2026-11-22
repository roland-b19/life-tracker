import { z } from "zod";
import { categorySchema } from "./categories";
import { isoDate, newId, uuid, visible } from "./common";

const todoSpaceSchema = z.enum(["personal", "business"]);
// "none" for a one-off task, "daily" for a repeating one.
const recurrencePatternSchema = z.enum(["none", "daily"]);

const todoFields = z.object({
  space: todoSpaceSchema.default("personal"),
  // Too long is told with the shared "Too long (max 150)" (validations/result.ts).
  title: z.string().trim().min(1, "Title is required").max(150).refine(visible, "Title is required"),
  isRecurring: z.boolean().default(false),
  recurrencePattern: recurrencePatternSchema.default("none"),
  dueDate: isoDate,
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)")
    .optional()
    .nullable(),
  // Only the daily list shows it; every task has one, "other" when it was never filed and always for a one-off task.
  category: categorySchema.default("other"),
});

/** A new task, with the id the add form made when it opened (D-040). */
export const addTodoSchema = todoFields.extend({ id: newId });

// A time the screen sends back (Undo) can be a minute ahead of the server clock, never more: a year-2099 time would pin a task on top for good.
const notInFuture = z.coerce.date().refine((d) => d.getTime() <= Date.now() + 60_000, "Date cannot be in the future");

/** Undo of a delete: the same row back, with its id. */
export const restoreTodoSchema = todoFields.extend({
  id: uuid,
  isCompleted: z.boolean(),
  isCarriedOver: z.boolean(),
  completedAt: notInFuture.nullable().optional(), // when the box last changed, so Undo keeps the list order
  createdAt: notInFuture,
  placedAt: notInFuture.optional(), // its place in the list, so Undo keeps the order
});

export const toggleTodoSchema = z.object({
  id: uuid,
  isCompleted: z.boolean(),
  // Undo of a tick: the time the box last changed before, so the task goes back to where it was. Left out, it is now.
  completedAt: notInFuture.nullable().optional(),
});

/** An edit sends only the fields it changed (D-040); the others keep what is stored. */
export const updateTodoSchema = z.object({
  id: uuid,
  title: todoFields.shape.title.optional(),
  reminderTime: todoFields.shape.reminderTime,
  // The one-off form has no category; a one-off task keeps "other" whatever is sent.
  category: categorySchema.optional(),
});

export const deleteTodoSchema = z.object({ id: uuid });

export const pushSubscriptionSchema = z.object({
  // https only: the push sender (Azure) will call this address, so it must not be http or any other scheme.
  endpoint: z.url({ protocol: /^https$/ }).max(500),
  p256dhKey: z.string().trim().min(1).max(255),
  authKey: z.string().trim().min(1).max(255),
});

export type TodoSpace = z.infer<typeof todoSpaceSchema>;
// Callers that never file a task (tests, the carry-over) can leave the category out: it is then "other".
export type AddTodoInput = Omit<z.infer<typeof todoFields>, "category"> & { category?: string };
export type RestoreTodoInput = z.input<typeof restoreTodoSchema>;
export type ToggleTodoInput = z.infer<typeof toggleTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

