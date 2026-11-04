import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/server/db";
import { businessIncomes } from "@/db/schema";
import { CreateBusinessIncomeInput, createBusinessIncomeSchema } from "./validations/business";
import { getExpenses, getMonthlyMoneySummary, MonthlyMoneySummary } from "./money";
import { getDailyTodos, TodoItem } from "./todos";

export interface BusinessIncomeItem {
  id: string;
  userId: string;
  amount: number;
  category: string;
  date: string;
  note: string | null;
  createdAt: Date;
}

export interface BusinessDashboardData {
  year: number;
  month: number;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  incomes: BusinessIncomeItem[];
  expensesSummary: MonthlyMoneySummary;
  recentExpenses: Array<{
    id: string;
    amount: number;
    category: string;
    date: string;
    notes: string | null;
  }>;
  pendingTasks: TodoItem[];
}

function getMonthDateBounds(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export async function addBusinessIncome(
  userId: string,
  rawInput: CreateBusinessIncomeInput,
): Promise<BusinessIncomeItem> {
  const validated = createBusinessIncomeSchema.parse(rawInput);

  const [income] = await db
    .insert(businessIncomes)
    .values({
      userId,
      amount: String(validated.amount),
      category: validated.category,
      date: validated.date,
      note: validated.note || null,
    })
    .returning({
      id: businessIncomes.id,
      userId: businessIncomes.userId,
      amount: businessIncomes.amount,
      category: businessIncomes.category,
      date: businessIncomes.date,
      note: businessIncomes.note,
      createdAt: businessIncomes.createdAt,
    });

  return {
    ...income,
    amount: Number(income.amount),
  };
}

export async function deleteBusinessIncome(
  userId: string,
  incomeId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(businessIncomes)
    .where(
      and(
        eq(businessIncomes.id, incomeId),
        eq(businessIncomes.userId, userId),
      ),
    )
    .returning({ id: businessIncomes.id });

  return deleted.length > 0;
}

export async function getBusinessIncomes(
  userId: string,
  year: number,
  month: number,
): Promise<{ incomes: BusinessIncomeItem[]; totalIncome: number }> {
  const { start, end } = getMonthDateBounds(year, month);

  const rows = await db
    .select({
      id: businessIncomes.id,
      userId: businessIncomes.userId,
      amount: businessIncomes.amount,
      category: businessIncomes.category,
      date: businessIncomes.date,
      note: businessIncomes.note,
      createdAt: businessIncomes.createdAt,
    })
    .from(businessIncomes)
    .where(
      and(
        eq(businessIncomes.userId, userId),
        gte(businessIncomes.date, start),
        lte(businessIncomes.date, end),
      ),
    )
    .orderBy(desc(businessIncomes.date), desc(businessIncomes.createdAt));

  const items = rows.map((r) => ({
    ...r,
    amount: Number(r.amount),
  }));

  const totalIncome = items.reduce((acc, i) => acc + i.amount, 0);

  return { incomes: items, totalIncome };
}

export async function getBusinessDashboard(
  userId: string,
  year: number,
  month: number,
): Promise<BusinessDashboardData> {
  const today = new Date().toISOString().slice(0, 10);
  const [incomesData, expensesSummary, recentExpenses, businessTodosResult] =
    await Promise.all([
      getBusinessIncomes(userId, year, month),
      getMonthlyMoneySummary(userId, "business", year, month),
      getExpenses(userId, "business", { limit: 20 }),
      getDailyTodos(userId, "business", today),
    ]);

  const totalIncome = Math.round(incomesData.totalIncome * 100) / 100;
  const totalExpenses = Math.round(expensesSummary.totalSpent * 100) / 100;
  const netProfit = Math.round((totalIncome - totalExpenses) * 100) / 100;

  return {
    year,
    month,
    totalIncome,
    totalExpenses,
    netProfit,
    incomes: incomesData.incomes,
    expensesSummary,
    recentExpenses: recentExpenses.map((e) => ({
      id: e.id,
      amount: e.amount,
      category: e.category,
      date: e.date,
      notes: e.notes,
    })),
    pendingTasks: businessTodosResult.todos.filter((t) => !t.isCompleted),
  };
}
