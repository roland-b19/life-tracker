"use server";

import { assertPushEnabled } from "@/lib/features";
import { requireUser } from "@/server/auth";
import {
  createTodoSchema,
  deleteTodoSchema,
  isoDate,
  restoreTodoSchema,
  pushSubscriptionSchema,
  TodoSpace,
  todoSpaceSchema,
  toggleTodoSchema,
  updateTodoSchema,
} from "@/lib/validations/todos";
import { addDays, toISODate } from "@/lib/format-date";
import {
  createTodo,
  deleteTodo,
  findTodo,
  getDailyTodos,
  hasDuplicateTodo,
  removePushSubscription,
  restoreTodo,
  savePushSubscription,
  toggleTodo,
  updateTodo,
} from "@/lib/todos";

// Tasks live on today. A day of slack either side covers the user's timezone and a page left open past midnight.
function assertToday(day: string) {
  const today = toISODate();
  if (day < addDays(today, -1) || day > addDays(today, 1)) throw new Error("Tasks can only be added or changed for today.");
}

// A repeating task keeps its first day for good, so Undo (`startedBefore`) may bring one back from long ago.
function assertPlannable(task: { isRecurring?: boolean; dueDate: string }, startedBefore = false) {
  if (!(startedBefore && task.isRecurring)) assertToday(task.dueDate);
}

/** A change to a one-off task is made on its own day, to a daily one on today. */
const assertChangeable = (task: { isRecurring: boolean; dueDate: string }) => assertToday(task.isRecurring ? toISODate() : task.dueDate);

const duplicate = (title: string) => ({ success: false as const, error: `"${title}" is already on this list.` });

export async function createTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = createTodoSchema.parse(rawInput);
  assertPlannable(parsed);
  if (await hasDuplicateTodo(userId, parsed)) return duplicate(parsed.title);
  const todo = await createTodo(userId, parsed);
  return { success: true as const, todo };
}

/** Undo of a delete. */
export async function restoreTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = restoreTodoSchema.parse(rawInput);
  assertPlannable(parsed, true);
  if (await hasDuplicateTodo(userId, parsed, parsed.id)) return duplicate(parsed.title);
  const todo = await restoreTodo(userId, parsed);
  return { success: todo !== null, todo };
}

export async function toggleTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = toggleTodoSchema.parse(rawInput);
  const task = await findTodo(userId, parsed.id);
  if (task) assertChangeable(task);
  // A daily task is ticked for today only, and only once it has started.
  if (task?.isRecurring && toISODate() < task.dueDate) throw new Error("This task is not due today.");
  const updated = await toggleTodo(userId, parsed);
  return { success: true, updated };
}

export async function updateTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = updateTodoSchema.parse(rawInput);
  const task = await findTodo(userId, parsed.id);
  if (!task) return { success: false, todo: null };
  assertChangeable(task);
  if (await hasDuplicateTodo(userId, { ...task, title: parsed.title }, task.id)) return duplicate(parsed.title);
  const todo = await updateTodo(userId, parsed);
  return { success: todo !== null, todo };
}

/** Deleted for good; Undo restores it from the screen's copy. */
export async function deleteTodoAction(todoId: string) {
  const userId = await requireUser();
  const parsed = deleteTodoSchema.parse({ id: todoId });
  const task = await findTodo(userId, parsed.id);
  if (!task) return { success: true, deleted: false };
  assertChangeable(task);
  const result = await deleteTodo(userId, parsed.id);
  return { success: true, deleted: result !== null };
}

export async function getDailyTodosAction(space: TodoSpace, date: string) {
  const userId = await requireUser();
  const result = await getDailyTodos(userId, todoSpaceSchema.parse(space), isoDate.parse(date));
  return { success: true, ...result };
}

/**
 * Everything the Tasks page shows for today, in one round trip: Next runs server actions one at a time,
 * so separate calls would cost a session, a network trip and a wait each, in a row.
 */
export async function loadTodosViewAction() {
  const userId = await requireUser();
  const both = <T>(read: (space: TodoSpace) => Promise<T>) => Promise.all([read("personal"), read("business")]);
  const daily = await both((space) => getDailyTodos(userId, space, toISODate()));
  return { success: true, daily };
}

export async function savePushSubscriptionAction(rawInput: unknown) {
  assertPushEnabled();
  const userId = await requireUser();
  const parsed = pushSubscriptionSchema.parse(rawInput);
  const subscription = await savePushSubscription(userId, parsed);
  return { success: true, subscription };
}

export async function deletePushSubscriptionAction(endpoint: string) {
  assertPushEnabled();
  const userId = await requireUser();
  const parsed = pushSubscriptionSchema.shape.endpoint.parse(endpoint);
  return { success: true, deleted: await removePushSubscription(userId, parsed) };
}
