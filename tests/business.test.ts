import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { users } from "@/db/schema";
import { addBusinessIncome, deleteBusinessIncome, getBusinessDashboard } from "@/lib/business";
import { logExpense } from "@/lib/money";
import { createTodo } from "@/lib/todos";
import { executeFoodAiTool } from "@/lib/food-ai-tools";

async function seedUser(subject: string) {
  const [user] = await db
    .insert(users)
    .values({ issuer: "test", subject })
    .returning({ id: users.id });
  return user.id;
}

describe("Family Business Module: Dashboard, Profit & Multi-User Isolation", () => {
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    userA = await seedUser(`business-userA-${randomUUID()}`);
    userB = await seedUser(`business-userB-${randomUUID()}`);
  });

  it("calculates monthly net profit correctly (income - business expenses)", async () => {
    // 1. Add Business Incomes for User A in November 2026
    await addBusinessIncome(userA, {
      amount: 5000,
      category: "Product Sales",
      date: "2026-11-02",
      note: "Online orders batch 1",
    });

    await addBusinessIncome(userA, {
      amount: 2500,
      category: "Consulting",
      date: "2026-11-04",
      note: "Client deposit",
    });

    // 2. Add Business Expense for User A
    await logExpense(userA, {
      space: "business",
      amount: 1500,
      currency: "RON",
      category: "Inventory",
      date: "2026-11-03",
      notes: "Raw materials restock",
    });

    // 3. Add Personal Expense for User A (must NOT affect business profit)
    await logExpense(userA, {
      space: "personal",
      amount: 300,
      currency: "RON",
      category: "Groceries",
      date: "2026-11-03",
      notes: "Personal grocery shopping",
    });

    // 4. Add Business Todo Task for User A
    await createTodo(userA, {
      space: "business",
      title: "Ship order #1042",
      dueDate: "2026-11-04",
      isRecurring: false,
      recurrencePattern: "none",
    });

    const dashboard = await getBusinessDashboard(userA, 2026, 11);

    expect(dashboard.totalIncome).toBe(7500);
    expect(dashboard.totalExpenses).toBe(1500);
    expect(dashboard.netProfit).toBe(6000); // 7500 - 1500
    expect(dashboard.incomes.length).toBe(2);
    expect(dashboard.pendingTasks.length).toBe(1);
    expect(dashboard.pendingTasks[0].title).toBe("Ship order #1042");
  });

  it("enforces multi-user isolation on business incomes and dashboard", async () => {
    const incomeA = await addBusinessIncome(userA, {
      amount: 10000,
      category: "Wholesale",
      date: "2026-11-04",
    });

    // User B dashboard should be empty
    const dashboardB = await getBusinessDashboard(userB, 2026, 11);
    expect(dashboardB.totalIncome).toBe(0);
    expect(dashboardB.netProfit).toBe(0);
    expect(dashboardB.incomes.length).toBe(0);

    // User B cannot delete User A's income
    const deletedByB = await deleteBusinessIncome(userB, incomeA.id);
    expect(deletedByB).toBe(false);

    // User A can delete own income
    const deletedByA = await deleteBusinessIncome(userA, incomeA.id);
    expect(deletedByA).toBe(true);
  });

  it("strictly enforces AI quarantine on business data", async () => {
    // Attempting to query business data or profit through the Food AI connector must throw
    await expect(
      executeFoodAiTool(userA, "get_business_profit", { month: 11 }),
    ).rejects.toThrow("The AI connector only has access to food tools.");

    await expect(
      executeFoodAiTool(userA, "get_business_incomes", {}),
    ).rejects.toThrow("The AI connector only has access to food tools.");
  });
});
