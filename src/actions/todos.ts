"use server";

import { assertPushEnabled } from "@/lib/features";
import { requireUser } from "@/server/auth";
import {
  addTodoSchema,
  deleteTodoSchema,
  restoreTodoSchema,
  pushSubscriptionSchema,
  TODO_GONE,
  TodoSpace,
  toggleTodoSchema,
  updateTodoSchema,
} from "@/lib/validations/todos";
import { addDays, toISODate } from "@/lib/format-date";
import { Refusal, respond } from "@/lib/validations/result";
import {
  addTodo,
  deleteTodo,
  findTodo,
  getDailyTodos,
  removePushSubscription,
  restoreTodo,
  savePushSubscription,
  toggleTodo,
  updateTodo,
} from "@/lib/todos";

// Tasks live on today (D-036). A day of slack backwards covers a page left open past midnight; a day not yet begun is refused.
function assertToday(day: string) {
  const today = toISODate();
  if (day < addDays(today, -1) || day > today) throw new Refusal("Tasks can only be added or changed for today.");
}

// A repeating task keeps its first day for good, so Undo (`startedBefore`) may bring one back from long ago, but never from a day not yet started.
function assertPlannable(task: { isRecurring?: boolean; dueDate: string }, startedBefore = false) {
  if (startedBefore && task.isRecurring) {
    if (task.dueDate > toISODate()) throw new Refusal("Tasks can only be added or changed for today.");
  } else assertToday(task.dueDate);
}

/** A change to a one-off task is made on its own day, to a daily one on today. */
const assertChangeable = (task: { isRecurring: boolean; dueDate: string }) => assertToday(task.isRecurring ? toISODate() : task.dueDate);

const gone = () => new Refusal(TODO_GONE);

/**
 * Adds a task; a repeat of the same add (same id) answers the task already there with `repeated`, an id another user
 * holds is refused. Two tasks with one title are both kept (D-036).
 */
export async function addTodoAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const parsed = addTodoSchema.parse(rawInput);
    assertPlannable(parsed);
    // A page left open past midnight still says yesterday: an open one-off task from a past day would never show or carry over, so it goes on today.
    const today = toISODate();
    const input = !parsed.isRecurring && parsed.dueDate < today ? { ...parsed, dueDate: today } : parsed;
    const { todo, repeated } = await addTodo(userId, input);
    if (!todo) throw new Refusal("This task could not be saved.");
    return { todo, repeated };
  });
}

/** Undo of a delete. */
export async function restoreTodoAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const parsed = restoreTodoSchema.parse(rawInput);
    assertPlannable(parsed, true);
    const todo = await restoreTodo(userId, parsed);
    if (!todo) throw new Refusal("This task could not be restored.");
    return { todo };
  });
}

export async function toggleTodoAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const parsed = toggleTodoSchema.parse(rawInput);
    const task = await findTodo(userId, parsed.id);
    if (!task) throw gone();
    assertChangeable(task);
    // A daily task is ticked for today only, and only once it has started.
    if (task.isRecurring && toISODate() < task.dueDate) throw new Refusal("This task is not due today.");
    await toggleTodo(userId, parsed);
    return {};
  });
}

/** Changes only the fields the edit sent (D-040). */
export async function updateTodoAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const parsed = updateTodoSchema.parse(rawInput);
    const task = await findTodo(userId, parsed.id);
    if (!task) throw gone();
    assertChangeable(task);
    const todo = await updateTodo(userId, parsed);
    if (!todo) throw gone();
    return { todo };
  });
}

/** Deleted for good; Undo restores it from the screen's copy. A task that is not there is not a failure: `deleted` says so. */
export async function deleteTodoAction(todoId: string) {
  return respond(async () => {
    const userId = await requireUser();
    const parsed = deleteTodoSchema.parse({ id: todoId });
    const task = await findTodo(userId, parsed.id);
    if (!task) return { deleted: false };
    assertChangeable(task);
    return { deleted: (await deleteTodo(userId, parsed.id)) !== null };
  });
}

/**
 * Everything the Tasks page shows for today, in one round trip: Next runs server actions one at a time,
 * so separate calls would cost a session, a network trip and a wait each, in a row.
 */
export async function loadTodosViewAction() {
  return respond(async () => {
    const userId = await requireUser();
    const both = <T>(read: (space: TodoSpace) => Promise<T>) => Promise.all([read("personal"), read("business")]);
    return { daily: await both((space) => getDailyTodos(userId, space, toISODate())) };
  });
}

export async function savePushSubscriptionAction(rawInput: unknown) {
  assertPushEnabled();
  return respond(async () => {
    const userId = await requireUser();
    return { subscription: await savePushSubscription(userId, pushSubscriptionSchema.parse(rawInput)) };
  });
}

export async function deletePushSubscriptionAction(endpoint: string) {
  assertPushEnabled();
  return respond(async () => {
    const userId = await requireUser();
    return { deleted: await removePushSubscription(userId, pushSubscriptionSchema.shape.endpoint.parse(endpoint)) };
  });
}
