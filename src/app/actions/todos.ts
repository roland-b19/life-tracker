"use server";

import { z } from "zod";
import { assertPushEnabled } from "@/lib/features";
import { requireUser } from "@/server/auth";
import {
  createTodoSchema,
  deleteTodoSchema,
  isoDate,
  moveTodoSchema,
  restoreTodoSchema,
  PLAN_AHEAD_DAYS,
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
  getPlannedDays,
  getTodoHistory,
  hasDuplicateTodo,
  moveTodo,
  removePushSubscription,
  restoreTodo,
  revertMoveTodo,
  savePushSubscription,
  toggleTodo,
  updateTodo,
} from "@/lib/todos";

// One-off tasks go on today up to a week ahead, or yesterday (a day of slack either side covers the user's timezone).
// A repeating task keeps its first day for good, so Undo (`startedBefore`) may bring one back from long ago; a new or moved one must start in the window too.
function assertPlannable(task: { isRecurring?: boolean; dueDate: string }, startedBefore = false) {
  const today = toISODate();
  if (!(startedBefore && task.isRecurring) && (task.dueDate < addDays(today, -1) || task.dueDate > addDays(today, PLAN_AHEAD_DAYS + 1))) {
    throw new Error(`Tasks can be planned up to ${PLAN_AHEAD_DAYS} days ahead.`);
  }
}

/** The day a change to `task` is made on: a one-off task's own day, today for a daily one. */
const changeDay = (task: { isRecurring: boolean; dueDate: string }) => (task.isRecurring ? toISODate() : task.dueDate);

/** Today and a week ahead can be changed, and yesterday for a day of grace; earlier days are as they were. */
function assertChangeable(day: string) {
  const today = toISODate();
  if (day < addDays(today, -1)) throw new Error("Days before yesterday cannot be changed.");
  if (day > addDays(today, PLAN_AHEAD_DAYS + 1)) throw new Error(`Tasks can be planned up to ${PLAN_AHEAD_DAYS} days ahead.`);
}

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

/** Undo of a move: `createdId` is the task a move created in place of an ended daily one. */
export async function revertMoveTodoAction(rawInput: unknown, createdId?: string) {
  const userId = await requireUser();
  const parsed = restoreTodoSchema.parse(rawInput);
  const created = createdId ? z.string().uuid().parse(createdId) : undefined;
  assertPlannable(parsed, true);
  const except = [parsed.id, ...(created ? [created] : [])];
  if (await hasDuplicateTodo(userId, parsed, except)) return duplicate(parsed.title);
  const todo = await revertMoveTodo(userId, parsed, created);
  return { success: todo !== null, todo };
}

export async function toggleTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = toggleTodoSchema.parse(rawInput);
  const task = await findTodo(userId, parsed.id);
  if (task) assertChangeable(changeDay(task));
  // A daily task is ticked for today only (the server's today, whatever day the screen shows), and only while it runs.
  const today = toISODate();
  if (task?.isRecurring && (today < task.dueDate || (task.endedOn && today >= task.endedOn))) {
    throw new Error("This task is not due today.");
  }
  const updated = await toggleTodo(userId, task?.isRecurring ? { ...parsed, currentDate: today } : parsed);
  return { success: true, updated };
}

export async function updateTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = updateTodoSchema.parse(rawInput);
  const task = await findTodo(userId, parsed.id);
  if (!task) return { success: false, todo: null };
  assertChangeable(changeDay(task));
  if (await hasDuplicateTodo(userId, { ...task, title: parsed.title }, task.id)) return duplicate(parsed.title);
  const todo = await updateTodo(userId, parsed);
  return { success: todo !== null, todo };
}

export async function moveTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = moveTodoSchema.parse(rawInput);
  const isRecurring = parsed.recurrencePattern !== "none";
  assertPlannable({ isRecurring, dueDate: parsed.dueDate });
  const task = await findTodo(userId, parsed.id);
  if (task) assertChangeable(changeDay(task));
  if (task && (await hasDuplicateTodo(userId, { ...task, title: parsed.title ?? task.title, isRecurring, dueDate: parsed.dueDate }, task.id))) {
    return duplicate(parsed.title ?? task.title);
  }
  const todo = await moveTodo(userId, parsed);
  return { success: todo !== null, todo };
}

/** A daily task is deleted from today on, the days before keep it. */
export async function deleteTodoAction(todoId: string) {
  const userId = await requireUser();
  const parsed = deleteTodoSchema.parse({ id: todoId });
  const task = await findTodo(userId, parsed.id);
  if (!task) return { success: true, deleted: false };
  assertChangeable(changeDay(task));
  const result = await deleteTodo(userId, parsed.id);
  return { success: true, deleted: result !== null };
}

export async function getDailyTodosAction(space: TodoSpace, date: string) {
  const userId = await requireUser();
  const result = await getDailyTodos(userId, todoSpaceSchema.parse(space), isoDate.parse(date));
  return { success: true, ...result };
}

/**
 * Everything the Tasks page shows for one day, in one round trip: Next runs server actions one at a time,
 * so eight separate calls per day change cost eight sessions, eight network trips and eight waits in a row.
 */
export async function loadTodosViewAction(date: string) {
  const userId = await requireUser();
  const day = isoDate.parse(date);
  const plannedSince = addDays(toISODate(), -1);
  const both = <T>(read: (space: TodoSpace) => Promise<T>) => Promise.all([read("personal"), read("business")]);
  const [daily, history, planned] = await Promise.all([
    both((space) => getDailyTodos(userId, space, day)),
    both((space) => getTodoHistory(userId, space)),
    both((space) => getPlannedDays(userId, space, plannedSince)),
  ]);
  return { success: true, daily, history, planned };
}

export async function getPlannedDaysAction(space: TodoSpace) {
  const userId = await requireUser();
  const parsed = todoSpaceSchema.parse(space);
  // A day back covers the user's timezone; the calendar only marks days after its own today.
  return { success: true, days: await getPlannedDays(userId, parsed, addDays(toISODate(), -1)) };
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
