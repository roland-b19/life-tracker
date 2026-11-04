"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import {
  createCategorySchema,
  deleteExpenseSchema,
  ExpenseSpace,
  logExpenseSchema,
} from "@/lib/validations/money";
import {
  createCustomCategory,
  deleteExpense,
  getExpenses,
  getMonthlyMoneySummary,
  logExpense,
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
  safeRevalidate("/business");
  return { success: true, expense };
}

export async function deleteExpenseAction(expenseId: string) {
  const userId = await requireUser();
  const parsed = deleteExpenseSchema.parse({ id: expenseId });
  const deleted = await deleteExpense(userId, parsed.id);
  safeRevalidate("/money");
  safeRevalidate("/business");
  return { success: true, deleted };
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
