import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { expenseCategories, expenses } from "@/db/schema";
import { ensureDefaultCategories } from "./money-seed";
import {
  CreateCategoryInput,
  ExpenseSpace,
  LogExpenseInput,
} from "./validations/money";

export interface ExpenseItem {
  id: string;
  userId: string;
  space: ExpenseSpace;
  amount: number;
  currency: string;
  category: string;
  date: string;
  notes: string | null;
  createdAt: Date;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  percentage: number;
  count: number;
}

export interface MonthlyMoneySummary {
  space: ExpenseSpace;
  year: number;
  month: number;
  totalSpent: number;
  expenseCount: number;
  categories: CategoryBreakdown[];
}

export async function getExpenseCategories(
  userId: string,
  space: ExpenseSpace,
) {
  await ensureDefaultCategories();

  const rows = await db
    .select()
    .from(expenseCategories)
    .where(
      and(
        or(isNull(expenseCategories.userId), eq(expenseCategories.userId, userId)),
        or(eq(expenseCategories.space, space), eq(expenseCategories.space, "both")),
      ),
    )
    .orderBy(expenseCategories.name);

  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  });
}

export async function createCustomCategory(
  userId: string,
  input: CreateCategoryInput,
) {
  const [created] = await db
    .insert(expenseCategories)
    .values({
      userId,
      name: input.name,
      space: input.space,
      icon: input.icon ?? null,
    })
    .returning();

  return created;
}

export async function logExpense(userId: string, input: LogExpenseInput) {
  const amountNumber = Number(input.amount);
  if (isNaN(amountNumber) || amountNumber <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const [created] = await db
    .insert(expenses)
    .values({
      userId,
      space: input.space,
      amount: amountNumber.toFixed(2),
      currency: "RON",
      category: input.category,
      date: input.date,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    })
    .returning();

  return {
    ...created,
    amount: Number(created.amount),
    space: created.space as ExpenseSpace,
  };
}

export async function deleteExpense(userId: string, expenseId: string): Promise<boolean> {
  const deleted = await db
    .delete(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.userId, userId)))
    .returning({ id: expenses.id });

  return deleted.length > 0;
}

export async function getExpenses(
  userId: string,
  space: ExpenseSpace,
  options?: { month?: string; limit?: number },
): Promise<ExpenseItem[]> {
  const conditions = [
    eq(expenses.userId, userId),
    eq(expenses.space, space),
  ];

  if (options?.month) {
    const [yearStr, monthStr] = options.month.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const startDate = `${options.month}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${options.month}-${String(lastDay).padStart(2, "0")}`;

    conditions.push(gte(expenses.date, startDate));
    conditions.push(lte(expenses.date, endDate));
  }

  let query = db
    .select()
    .from(expenses)
    .where(and(...conditions))
    .orderBy(desc(expenses.date), desc(expenses.createdAt));

  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }

  const rows = await query;

  return rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
    space: r.space as ExpenseSpace,
  }));
}

export async function getMonthlyMoneySummary(
  userId: string,
  space: ExpenseSpace,
  year: number,
  month: number,
): Promise<MonthlyMoneySummary> {
  const monthPadded = String(month).padStart(2, "0");
  const monthStr = `${year}-${monthPadded}`;
  const startDate = `${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${monthStr}-${String(lastDay).padStart(2, "0")}`;

  const rows = await db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        eq(expenses.space, space),
        gte(expenses.date, startDate),
        lte(expenses.date, endDate),
      ),
    );

  let totalSpent = 0;
  const categoryMap = new Map<string, { total: number; count: number }>();

  for (const row of rows) {
    const amt = Number(row.amount);
    totalSpent += amt;
    const existing = categoryMap.get(row.category) ?? { total: 0, count: 0 };
    categoryMap.set(row.category, {
      total: existing.total + amt,
      count: existing.count + 1,
    });
  }

  // Round total to 2 decimals
  totalSpent = Math.round(totalSpent * 100) / 100;

  const categories: CategoryBreakdown[] = Array.from(categoryMap.entries())
    .map(([category, data]) => {
      const catTotal = Math.round(data.total * 100) / 100;
      const percentage =
        totalSpent > 0 ? Math.round((catTotal / totalSpent) * 1000) / 10 : 0;
      return {
        category,
        total: catTotal,
        percentage,
        count: data.count,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    space,
    year,
    month,
    totalSpent,
    expenseCount: rows.length,
    categories,
  };
}

export async function getMostUsedCategory(
  userId: string,
  space: ExpenseSpace,
): Promise<string> {
  const result = await db
    .select({
      category: expenses.category,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(expenses)
    .where(and(eq(expenses.userId, userId), eq(expenses.space, space)))
    .groupBy(expenses.category)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  if (result.length > 0 && result[0].category) {
    return result[0].category;
  }

  const defaultCats = await getExpenseCategories(userId, space);
  return defaultCats.length > 0 ? defaultCats[0].name : "Other";
}
