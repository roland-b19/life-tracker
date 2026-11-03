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

  const [
    personalCategories,
    businessCategories,
    mostUsedPersonal,
    personalSummary,
    businessSummary,
    personalExpenses,
    businessExpenses,
  ] = await Promise.all([
    getExpenseCategories(userId, "personal"),
    getExpenseCategories(userId, "business"),
    getMostUsedCategory(userId, "personal"),
    getMonthlyMoneySummary(userId, "personal", currentYear, currentMonth),
    getMonthlyMoneySummary(userId, "business", currentYear, currentMonth),
    getExpenses(userId, "personal", { month: monthStr, limit: 50 }),
    getExpenses(userId, "business", { month: monthStr, limit: 50 }),
  ]);

  return (
    <MoneyClient
      userName={session.user.name ?? "User"}
      initialYear={currentYear}
      initialMonth={currentMonth}
      personalCategories={personalCategories}
      businessCategories={businessCategories}
      initialMostUsedCategory={mostUsedPersonal}
      initialPersonalSummary={personalSummary}
      initialBusinessSummary={businessSummary}
      initialPersonalExpenses={personalExpenses}
      initialBusinessExpenses={businessExpenses}
    />
  );
}
