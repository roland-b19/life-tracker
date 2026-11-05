"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import {
  createTodoSchema,
  deleteTodoSchema,
  pushSubscriptionSchema,
  TodoSpace,
  toggleTodoSchema,
  updateTodoSchema,
} from "@/lib/validations/todos";
import {
  createTodo,
  deleteTodo,
  getDailyTodos,
  getTodoHistory,
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

export async function createTodoAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = createTodoSchema.parse(rawInput);
  const todo = await createTodo(userId, parsed);
  safeRevalidate("/todos");
  return { success: true, todo };
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

