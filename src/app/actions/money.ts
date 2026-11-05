"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import {
  createCategorySchema,
  deleteExpenseSchema,
  updateCategorySchema,
  updateExpenseSchema,
  ExpenseSpace,
  logExpenseSchema,
} from "@/lib/validations/money";
import {
  createCustomCategory,
  deleteCustomCategory,
  deleteExpense,
  getExpenses,
  getMonthlyMoneySummary,
  logExpense,
  renameCustomCategory,
  updateExpense,
} from "@/lib/money";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // No-op in test runner
  }
}

export async function logExpenseAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = logExpenseSchema.parse(rawInput);
  const expense = await logExpense(userId, parsed);
  safeRevalidate("/money");
  return { success: true, expense };
}

export async function deleteExpenseAction(expenseId: string) {
  const userId = await requireUser();
  const parsed = deleteExpenseSchema.parse({ id: expenseId });
  const deleted = await deleteExpense(userId, parsed.id);
  safeRevalidate("/money");
  return { success: true, deleted };
}

export async function updateExpenseAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = updateExpenseSchema.parse(rawInput);
  const updated = await updateExpense(userId, parsed);
  safeRevalidate("/money");
  return { success: updated };
}

export async function updateCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = updateCategorySchema.parse(rawInput);
  const previousName = await renameCustomCategory(userId, parsed.id, parsed.name);
  safeRevalidate("/money");
  return { success: previousName !== null, previousName };
}

export async function deleteCategoryAction(categoryId: string) {
  const userId = await requireUser();
  const parsed = deleteExpenseSchema.parse({ id: categoryId });
  const deleted = await deleteCustomCategory(userId, parsed.id);
  safeRevalidate("/money");
  return { success: deleted };
}

export async function createCategoryAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = createCategorySchema.parse(rawInput);
  const category = await createCustomCategory(userId, parsed);
  safeRevalidate("/money");
  return { success: true, category };
}

export async function getMonthlySummaryAction(
  space: ExpenseSpace,
  year: number,
  month: number,
) {
  const userId = await requireUser();
  const summary = await getMonthlyMoneySummary(userId, space, year, month);
  return { success: true, summary };
}

export async function getExpensesAction(
  space: ExpenseSpace,
  month?: string,
) {
  const userId = await requireUser();
  const expenses = await getExpenses(userId, space, { month });
  return { success: true, expenses };
}
