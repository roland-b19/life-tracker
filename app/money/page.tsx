import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import {
  getExpenseCategories,
  getExpenses,
  getMonthlyMoneySummary,
  getMostUsedCategory,
} from "@/lib/money";
import { MoneyClient } from "./money-client";

export default async function MoneyPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const monthStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

  const [categories, mostUsedCategory, summary, expenses] = await Promise.all([
    getExpenseCategories(userId, "personal"),
    getMostUsedCategory(userId, "personal"),
    getMonthlyMoneySummary(userId, "personal", currentYear, currentMonth),
    getExpenses(userId, "personal", { month: monthStr }),
  ]);

  return (
    <MoneyClient
      userName={session.user.name ?? "User"}
      initialYear={currentYear}
      initialMonth={currentMonth}
      categories={categories}
      initialMostUsedCategory={mostUsedCategory}
      initialSummary={summary}
      initialExpenses={expenses}
    />
  );
}
