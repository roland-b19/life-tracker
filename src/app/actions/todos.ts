"use server";

import { assertPushEnabled } from "@/lib/features";
import { requireUser } from "@/server/auth";
import {
  createTodoSchema,
  deleteTodoSchema,
  restoreTodoSchema,
  pushSubscriptionSchema,
  TodoSpace,
  toggleTodoSchema,
  updateTodoSchema,
} from "@/lib/validations/todos";
import { addDays, toISODate } from "@/lib/format-date";
import { Refusal, respond } from "@/lib/validations/result";
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
  if (day < addDays(today, -1) || day > addDays(today, 1)) throw new Refusal("Tasks can only be added or changed for today.");
}

// A repeating task keeps its first day for good, so Undo (`startedBefore`) may bring one back from long ago, but never from a day not yet started.
function assertPlannable(task: { isRecurring?: boolean; dueDate: string }, startedBefore = false) {
  if (startedBefore && task.isRecurring) {
    if (task.dueDate > addDays(toISODate(), 1)) throw new Refusal("Tasks can only be added or changed for today.");
  } else assertToday(task.dueDate);
}

/** A change to a one-off task is made on its own day, to a daily one on today. */
const assertChangeable = (task: { isRecurring: boolean; dueDate: string }) => assertToday(task.isRecurring ? toISODate() : task.dueDate);

const gone = () => new Refusal("This task no longer exists.");
const duplicate = (title: string) => new Refusal(`"${title}" is already on this list.`);

export async function createTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  return respond(async () => {
    const parsed = createTodoSchema.parse(rawInput);
    assertPlannable(parsed);
    // A page left open past midnight still says yesterday: an open one-off task from a past day would never show or carry over, so it goes on today.
    const today = toISODate();
    const input = !parsed.isRecurring && parsed.dueDate < today ? { ...parsed, dueDate: today } : parsed;
    if (await hasDuplicateTodo(userId, input)) throw duplicate(input.title);
    return { todo: await createTodo(userId, input) };
  });
}

/** Undo of a delete. */
export async function restoreTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  return respond(async () => {
    const parsed = restoreTodoSchema.parse(rawInput);
    assertPlannable(parsed, true);
    if (await hasDuplicateTodo(userId, parsed, parsed.id)) throw duplicate(parsed.title);
    const todo = await restoreTodo(userId, parsed);
    if (!todo) throw new Refusal("This task could not be restored.");
    return { todo };
  });
}

export async function toggleTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  return respond(async () => {
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

export async function updateTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  return respond(async () => {
    const parsed = updateTodoSchema.parse(rawInput);
    const task = await findTodo(userId, parsed.id);
    if (!task) throw gone();
    assertChangeable(task);
    if (await hasDuplicateTodo(userId, { ...task, title: parsed.title }, task.id)) throw duplicate(parsed.title);
    const todo = await updateTodo(userId, parsed);
    if (!todo) throw gone();
    return { todo };
  });
}

/** Deleted for good; Undo restores it from the screen's copy. A task that is not there is not a failure: `deleted` says so. */
export async function deleteTodoAction(todoId: string) {
  const userId = await requireUser();
  return respond(async () => {
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
  const userId = await requireUser();
  const both = <T>(read: (space: TodoSpace) => Promise<T>) => Promise.all([read("personal"), read("business")]);
  return respond(async () => ({ daily: await both((space) => getDailyTodos(userId, space, toISODate())) }));
}

export async function savePushSubscriptionAction(rawInput: unknown) {
  assertPushEnabled();
  const userId = await requireUser();
  return respond(async () => ({ subscription: await savePushSubscription(userId, pushSubscriptionSchema.parse(rawInput)) }));
}

export async function deletePushSubscriptionAction(endpoint: string) {
  assertPushEnabled();
  const userId = await requireUser();
  return respond(async () => ({ deleted: await removePushSubscription(userId, pushSubscriptionSchema.shape.endpoint.parse(endpoint)) }));
}
