"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import {
  createTodoSchema,
  DEV_EDIT_PAST,
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
import { isDueOn } from "@/lib/streak";
import {
  createTodo,
  deleteTodo,
  findTodo,
  getDailyTodos,
  getPlannedDays,
  getTodoHistory,
  hasDuplicateTodo,
  moveTodo,
  restoreTodo,
  savePushSubscription,
  toggleTodo,
  updateTodo,
} from "@/lib/todos";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // No-op in test runner
  }
}

// One-off tasks go on today up to a week ahead (dev builds may also use past days); a day of slack either side covers the user's timezone.
function assertPlannable(task: { isRecurring?: boolean; dueDate: string }) {
  const today = toISODate();
  const tooEarly = !DEV_EDIT_PAST && task.dueDate < addDays(today, -1);
  if (!task.isRecurring && (tooEarly || task.dueDate > addDays(today, PLAN_AHEAD_DAYS + 1))) {
    throw new Error(`Tasks can be planned up to ${PLAN_AHEAD_DAYS} days ahead.`);
  }
}

const duplicate = (title: string) => ({ success: false as const, error: `"${title}" is already on this list.` });

export async function createTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = createTodoSchema.parse(rawInput);
  assertPlannable(parsed);
  if (await hasDuplicateTodo(userId, parsed)) return duplicate(parsed.title);
  const todo = await createTodo(userId, parsed);
  safeRevalidate("/todos");
  return { success: true as const, todo };
}

export async function restoreTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = restoreTodoSchema.parse(rawInput);
  assertPlannable(parsed);
  if (await hasDuplicateTodo(userId, parsed, parsed.id)) return duplicate(parsed.title);
  const todo = await restoreTodo(userId, parsed);
  safeRevalidate("/todos");
  return { success: todo !== null, todo };
}

export async function toggleTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = toggleTodoSchema.parse(rawInput);
  const task = await findTodo(userId, parsed.id);
  // Past days can be ticked (as on screen); a repeating task only on a day it is due, never ahead of time
  // (a day of slack covers the user's timezone).
  if (
    task?.isRecurring &&
    (parsed.currentDate > addDays(toISODate(), 1) ||
      parsed.currentDate < task.dueDate ||
      (task.endedOn && parsed.currentDate >= task.endedOn) ||
      !isDueOn(task.recurrencePattern, parsed.currentDate))
  ) {
    throw new Error("This task is not due on that day.");
  }
  const updated = await toggleTodo(userId, parsed);
  safeRevalidate("/todos");
  return { success: true, updated };
}

export async function updateTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = updateTodoSchema.parse(rawInput);
  const task = await findTodo(userId, parsed.id);
  if (task) assertPlannable(task); // a one-off on a past day is read-only, as on screen
  if (task && (await hasDuplicateTodo(userId, { ...task, title: parsed.title }, task.id))) return duplicate(parsed.title);
  const updated = await updateTodo(userId, parsed);
  safeRevalidate("/todos");
  return { success: updated };
}

export async function moveTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = moveTodoSchema.parse(rawInput);
  const isRecurring = parsed.recurrencePattern !== "none";
  assertPlannable({ isRecurring, dueDate: parsed.dueDate });
  const task = await findTodo(userId, parsed.id);
  if (task) assertPlannable(task);
  if (task && (await hasDuplicateTodo(userId, { ...task, isRecurring, dueDate: parsed.dueDate }, task.id))) {
    return duplicate(task.title);
  }
  const todo = await moveTodo(userId, parsed);
  safeRevalidate("/todos");
  return { success: todo !== null, todo };
}

/** `day` is the day on screen: dev builds delete a repeating task from that past day on, others from today. */
export async function deleteTodoAction(todoId: string, day?: string) {
  const userId = await requireUser();
  const parsed = deleteTodoSchema.parse({ id: todoId, day });
  const today = toISODate();
  const task = await findTodo(userId, parsed.id);
  if (task) assertPlannable(task);
  const from = DEV_EDIT_PAST && parsed.day && parsed.day < today ? parsed.day : today;
  const deleted = await deleteTodo(userId, parsed.id, from);
  safeRevalidate("/todos");
  return { success: true, deleted };
}

export async function getDailyTodosAction(space: TodoSpace, date: string) {
  const userId = await requireUser();
  const result = await getDailyTodos(userId, todoSpaceSchema.parse(space), isoDate.parse(date));
  return { success: true, ...result };
}

export async function getPlannedDaysAction(space: TodoSpace) {
  const userId = await requireUser();
  const parsed = todoSpaceSchema.parse(space);
  // A day back covers the user's timezone; the calendar only marks days after its own today.
  return { success: true, days: await getPlannedDays(userId, parsed, addDays(toISODate(), -1)) };
}

export async function getTodoHistoryAction(space: TodoSpace) {
  const userId = await requireUser();
  return { success: true, history: await getTodoHistory(userId, todoSpaceSchema.parse(space)) };
}

export async function savePushSubscriptionAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = pushSubscriptionSchema.parse(rawInput);
  const subscription = await savePushSubscription(userId, parsed);
  return { success: true, subscription };
}

