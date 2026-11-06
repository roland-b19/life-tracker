"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import {
  createTodoSchema,
  DEV_EDIT_PAST,
  deleteTodoSchema,
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
  getDailyTodos,
  getPlannedDays,
  getTodoHistory,
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

export async function createTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = createTodoSchema.parse(rawInput);
  assertPlannable(parsed);
  const todo = await createTodo(userId, parsed);
  safeRevalidate("/todos");
  return { success: true, todo };
}

export async function restoreTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = restoreTodoSchema.parse(rawInput);
  assertPlannable(parsed);
  const todo = await restoreTodo(userId, parsed);
  safeRevalidate("/todos");
  return { success: todo !== null, todo };
}

export async function toggleTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = toggleTodoSchema.parse(rawInput);
  const updated = await toggleTodo(userId, parsed);
  safeRevalidate("/todos");
  return { success: true, updated };
}

export async function updateTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = updateTodoSchema.parse(rawInput);
  const updated = await updateTodo(userId, parsed);
  safeRevalidate("/todos");
  return { success: updated };
}

export async function moveTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = moveTodoSchema.parse(rawInput);
  assertPlannable({ isRecurring: parsed.recurrencePattern !== "none", dueDate: parsed.dueDate });
  const todo = await moveTodo(userId, parsed);
  safeRevalidate("/todos");
  return { success: todo !== null, todo };
}

export async function deleteTodoAction(todoId: string) {
  const userId = await requireUser();
  const parsed = deleteTodoSchema.parse({ id: todoId });
  const deleted = await deleteTodo(userId, parsed.id);
  safeRevalidate("/todos");
  return { success: true, deleted };
}

export async function getDailyTodosAction(space: TodoSpace, date: string) {
  const userId = await requireUser();
  const result = await getDailyTodos(userId, space, date);
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
  return { success: true, history: await getTodoHistory(userId, space) };
}

export async function savePushSubscriptionAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = pushSubscriptionSchema.parse(rawInput);
  const subscription = await savePushSubscription(userId, parsed);
  return { success: true, subscription };
}

