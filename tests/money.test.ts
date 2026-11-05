import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  id: "",
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super("Authentication required.");
      this.name = "UnauthorizedError";
    }
  },
}));

vi.mock("@/server/auth", () => ({
  UnauthorizedError: authState.UnauthorizedError,
  requireUser: vi.fn(async () => {
    if (!authState.id) throw new authState.UnauthorizedError();
    return authState.id;
  }),
}));

import { db } from "@/server/db";
import { users } from "@/db/schema";
import {
  createCustomCategory,
  deleteCustomCategory,
  deleteExpense,
  getExpenseCategories,
  getExpenses,
  getMonthlyMoneySummary,
  getMostUsedCategory,
  logExpense,
  renameCustomCategory,
  updateExpense,
} from "@/lib/money";
import {
  createCategoryAction,
  deleteExpenseAction,
  getExpensesAction,
  getMonthlySummaryAction,
  logExpenseAction,
} from "@/app/actions/money";

const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

async function seedUser(subject: string) {
  const [user] = await db
    .insert(users)
    .values({ issuer: "test", subject })
    .returning({ id: users.id });
  return user.id;
}

describe("Money module: Data Access, Analytics & Authorization", () => {
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    await admin.query(
      "TRUNCATE TABLE expenses, expense_categories, users CASCADE",
    );
  });

  beforeEach(async () => {
    await admin.query(
      "TRUNCATE TABLE expenses, expense_categories, users CASCADE",
    );
    userA = await seedUser(`user-a-${randomUUID()}`);
    userB = await seedUser(`user-b-${randomUUID()}`);
    authState.id = userA;
  });

  afterAll(async () => {
    await admin.end();
  });

  it("seeds default categories and isolates custom user categories", async () => {
    const personalCats = await getExpenseCategories(userA, "personal");
    expect(personalCats.some((c) => c.name === "Food & Groceries")).toBe(true);
    expect(personalCats.some((c) => c.name === "Gym & Supplements")).toBe(true);

    // Add custom category for user A
    await createCustomCategory(userA, {
      name: "Freelance Tools",
      space: "personal",
    });

    const userACats = await getExpenseCategories(userA, "personal");
    expect(userACats.some((c) => c.name === "Freelance Tools")).toBe(true);

    // User B should NOT see user A's custom category
    const userBCats = await getExpenseCategories(userB, "personal");
    expect(userBCats.some((c) => c.name === "Freelance Tools")).toBe(false);
  });

  it("prevents duplicate default categories during concurrent seeding", async () => {
    await Promise.all([
      getExpenseCategories(userA, "personal"),
      getExpenseCategories(userA, "personal"),
      getExpenseCategories(userB, "personal"),
    ]);

    const personalCats = await getExpenseCategories(userA, "personal");
    const names = personalCats.map((c) => c.name);
    const uniqueNames = Array.from(new Set(names));
    expect(names.length).toBe(uniqueNames.length);
  });

  it("enforces multi-user isolation on expenses", async () => {
    await logExpense(userA, {
      space: "personal",
      amount: 150.5,
      currency: "RON",
      category: "Food & Groceries",
      date: "2026-11-04",
      notes: "Weekly market run",
    });

    await logExpense(userB, {
      space: "personal",
      amount: 220,
      currency: "RON",
      category: "Gym & Supplements",
      date: "2026-11-04",
      notes: "Whey protein",
    });

    const userAExpenses = await getExpenses(userA, "personal");
    expect(userAExpenses).toHaveLength(1);
    expect(userAExpenses[0].amount).toBe(150.5);
    expect(userAExpenses[0].category).toBe("Food & Groceries");
    expect(userAExpenses[0].currency).toBe("RON");

    const userBExpenses = await getExpenses(userB, "personal");
    expect(userBExpenses).toHaveLength(1);
    expect(userBExpenses[0].amount).toBe(220);
    expect(userBExpenses[0].category).toBe("Gym & Supplements");
  });

  it("enforces space segregation between personal and business", async () => {
    await logExpense(userA, {
      space: "personal",
      amount: 45,
      currency: "RON",
      category: "Dining & Leisure",
      date: "2026-11-04",
    });

    await logExpense(userA, {
      space: "business",
      amount: 850,
      currency: "RON",
      category: "Inventory & Stock",
      date: "2026-11-04",
      notes: "Bulk supplier order",
    });

    const personal = await getExpenses(userA, "personal");
    expect(personal).toHaveLength(1);
    expect(personal[0].amount).toBe(45);
    expect(personal[0].space).toBe("personal");

    const business = await getExpenses(userA, "business");
    expect(business).toHaveLength(1);
    expect(business[0].amount).toBe(850);
    expect(business[0].space).toBe("business");
  });

  it("prevents cross-user expense deletion", async () => {
    const expense = await logExpense(userA, {
      space: "personal",
      amount: 100,
      currency: "RON",
      category: "Utilities & Bills",
      date: "2026-11-04",
    });

    // User B tries to delete User A's expense
    const deletedByB = await deleteExpense(userB, expense.id);
    expect(deletedByB).toBe(false);

    // Verify still exists for User A
    const listAfter = await getExpenses(userA, "personal");
    expect(listAfter).toHaveLength(1);

    // User A deletes their own expense
    const deletedByA = await deleteExpense(userA, expense.id);
    expect(deletedByA).toBe(true);

    const listEmpty = await getExpenses(userA, "personal");
    expect(listEmpty).toHaveLength(0);
  });

  it("edits expenses and own categories, never another user's", async () => {
    const expense = await logExpense(userA, {
      space: "personal",
      amount: 10,
      currency: "RON",
      category: "Utilities & Bills",
      date: "2026-11-04",
    });
    const edit = { id: expense.id, amount: 12.5, category: "Dining & Leisure", date: "2026-11-03" };
    expect(await updateExpense(userB, edit)).toBe(false);
    expect(await updateExpense(userA, edit)).toBe(true);
    const [after] = await getExpenses(userA, "personal");
    expect([after.amount, after.category, after.date]).toEqual([12.5, "Dining & Leisure", "2026-11-03"]);

    const cat = await createCustomCategory(userA, { name: "Pets", space: "personal" });
    await logExpense(userA, { space: "personal", amount: 5, currency: "RON", category: "Pets", date: "2026-11-04" });
    expect(await renameCustomCategory(userB, cat.id, "Hijacked")).toBeNull();
    expect(await renameCustomCategory(userA, cat.id, "Animals")).toBe("Pets");
    const renamed = await getExpenses(userA, "personal");
    expect(renamed.some((e) => e.category === "Animals")).toBe(true);
    expect(await deleteCustomCategory(userB, cat.id)).toBe(false);
    expect(await deleteCustomCategory(userA, cat.id)).toBe(true);
  });

  it("calculates monthly summary and category breakdown accurately", async () => {
    // Log multiple expenses in November 2026
    await logExpense(userA, {
      space: "personal",
      amount: 100,
      currency: "RON",
      category: "Food & Groceries",
      date: "2026-11-01",
    });
    await logExpense(userA, {
      space: "personal",
      amount: 50,
      currency: "RON",
      category: "Food & Groceries",
      date: "2026-11-02",
    });
    await logExpense(userA, {
      space: "personal",
      amount: 50,
      currency: "RON",
      category: "Transport & Fuel",
      date: "2026-11-03",
    });

    // Log an expense in October (should not be included)
    await logExpense(userA, {
      space: "personal",
      amount: 300,
      currency: "RON",
      category: "Health & Pharmacy",
      date: "2026-10-25",
    });

    const summary = await getMonthlyMoneySummary(userA, "personal", 2026, 11);
    expect(summary.totalSpent).toBe(200);
    expect(summary.expenseCount).toBe(3);
    expect(summary.categories).toHaveLength(2);

    expect(summary.categories[0].category).toBe("Food & Groceries");
    expect(summary.categories[0].total).toBe(150);
    expect(summary.categories[0].percentage).toBe(75);
    expect(summary.categories[0].count).toBe(2);

    expect(summary.categories[1].category).toBe("Transport & Fuel");
    expect(summary.categories[1].total).toBe(50);
    expect(summary.categories[1].percentage).toBe(25);
    expect(summary.categories[1].count).toBe(1);
  });

  it("identifies most-used category for fast preselection", async () => {
    await logExpense(userA, {
      space: "personal",
      amount: 20,
      currency: "RON",
      category: "Dining & Leisure",
      date: "2026-11-01",
    });
    await logExpense(userA, {
      space: "personal",
      amount: 30,
      currency: "RON",
      category: "Dining & Leisure",
      date: "2026-11-02",
    });
    await logExpense(userA, {
      space: "personal",
      amount: 100,
      currency: "RON",
      category: "Utilities & Bills",
      date: "2026-11-03",
    });

    const mostUsed = await getMostUsedCategory(userA, "personal");
    expect(mostUsed).toBe("Dining & Leisure");
  });

  it("rejects non-positive amounts", async () => {
    await expect(
      logExpense(userA, {
        space: "personal",
        amount: 0,
        currency: "RON",
        category: "Food & Groceries",
        date: "2026-11-04",
      }),
    ).rejects.toThrow();

    await expect(
      logExpense(userA, {
        space: "personal",
        amount: -50,
        currency: "RON",
        category: "Food & Groceries",
        date: "2026-11-04",
      }),
    ).rejects.toThrow();
  });

  describe("Server Actions authorization & validation guards", () => {
    it("rejects unauthenticated requests", async () => {
      authState.id = "";

      await expect(
        logExpenseAction({
          space: "personal",
          amount: 50,
          currency: "RON",
          category: "Food & Groceries",
          date: "2026-11-04",
        }),
      ).rejects.toThrow("Authentication required.");

      await expect(
        deleteExpenseAction(randomUUID()),
      ).rejects.toThrow("Authentication required.");

      await expect(
        createCategoryAction({
          name: "Software",
          space: "business",
        }),
      ).rejects.toThrow("Authentication required.");
    });

    it("executes server actions successfully for authenticated owner", async () => {
      authState.id = userA;

      const logRes = await logExpenseAction({
        space: "personal",
        amount: 88.5,
        currency: "RON",
        category: "Food & Groceries",
        date: "2026-11-04",
        notes: "Supermarket",
      });

      expect(logRes.success).toBe(true);
      expect(logRes.expense.amount).toBe(88.5);

      const listRes = await getExpensesAction("personal");
      expect(listRes.success).toBe(true);
      expect(listRes.expenses).toHaveLength(1);

      const summaryRes = await getMonthlySummaryAction("personal", 2026, 11);
      expect(summaryRes.success).toBe(true);
      expect(summaryRes.summary.totalSpent).toBe(88.5);

      const deleteRes = await deleteExpenseAction(logRes.expense.id);
      expect(deleteRes.success).toBe(true);
      expect(deleteRes.deleted).toBe(true);
    });
  });
});
