"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import {
  createTodoSchema,
  deleteTodoSchema,
  restoreTodoSchema,
  PLAN_AHEAD_DAYS,
  pushSubscriptionSchema,
  TodoSpace,
  toggleTodoSchema,
  updateTodoSchema,
} from "@/lib/validations/todos";
import { addDays, toISODate } from "@/lib/format-date";
import {
  createTodo,
  deleteTodo,
  getDailyTodos,
  getTodoHistory,
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

// One-off tasks go on today up to a week ahead; a day of slack either side covers the user's timezone.
function assertPlannable(task: { isRecurring?: boolean; dueDate: string }) {
  const today = toISODate();
  if (!task.isRecurring && (task.dueDate < addDays(today, -1) || task.dueDate > addDays(today, PLAN_AHEAD_DAYS + 1))) {
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

