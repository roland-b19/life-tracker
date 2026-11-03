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
  createTodo,
  deleteTodo,
  getDailyTodos,
  toggleTodo,
} from "@/lib/todos";
import {
  createTodoAction,
  deleteTodoAction,
  getDailyTodosAction,
  savePushSubscriptionAction,
  toggleTodoAction,
} from "@/app/actions/todos";

const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

async function seedUser(subject: string) {
  const [user] = await db
    .insert(users)
    .values({ issuer: "test", subject })
    .returning({ id: users.id });
  return user.id;
}

describe("To-Do & Habits module: Data Access, Rollover & Authorization", () => {
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    await admin.query(
      "TRUNCATE TABLE todos, push_subscriptions, users CASCADE",
    );
  });

  beforeEach(async () => {
    await admin.query(
      "TRUNCATE TABLE todos, push_subscriptions, users CASCADE",
    );
    userA = await seedUser(`user-a-${randomUUID()}`);
    userB = await seedUser(`user-b-${randomUUID()}`);
    authState.id = userA;
  });

  afterAll(async () => {
    await admin.end();
  });

  it("enforces multi-user isolation on todos", async () => {
    await createTodo(userA, {
      space: "personal",
      title: "Clean desk",
      dueDate: "2026-11-04",
      isRecurring: false,
      recurrencePattern: "none",
    });

    await createTodo(userB, {
      space: "personal",
      title: "Buy groceries",
      dueDate: "2026-11-04",
      isRecurring: false,
      recurrencePattern: "none",
    });

    const resA = await getDailyTodos(userA, "personal", "2026-11-04");
    expect(resA.todos).toHaveLength(1);
    expect(resA.todos[0].title).toBe("Clean desk");

    const resB = await getDailyTodos(userB, "personal", "2026-11-04");
    expect(resB.todos).toHaveLength(1);
    expect(resB.todos[0].title).toBe("Buy groceries");
  });

  it("enforces space segregation between personal and business", async () => {
    await createTodo(userA, {
      space: "personal",
      title: "Dentist appointment",
      dueDate: "2026-11-04",
      isRecurring: false,
      recurrencePattern: "none",
    });

    await createTodo(userA, {
      space: "business",
      title: "Review quarterly tax report",
      dueDate: "2026-11-04",
      isRecurring: false,
      recurrencePattern: "none",
    });

    const personal = await getDailyTodos(userA, "personal", "2026-11-04");
    expect(personal.todos).toHaveLength(1);
    expect(personal.todos[0].title).toBe("Dentist appointment");
    expect(personal.todos[0].space).toBe("personal");

    const business = await getDailyTodos(userA, "business", "2026-11-04");
    expect(business.todos).toHaveLength(1);
    expect(business.todos[0].title).toBe("Review quarterly tax report");
    expect(business.todos[0].space).toBe("business");
  });

  it("automatically carries over unfinished one-off tasks from past dates", async () => {
    // Created on Nov 1, never completed
    const pastTask = await createTodo(userA, {
      space: "personal",
      title: "Pay electricity bill",
      dueDate: "2026-11-01",
      isRecurring: false,
      recurrencePattern: "none",
    });

    expect(pastTask.isCarriedOver).toBe(false);

    // Query on Nov 4
    const todayResult = await getDailyTodos(userA, "personal", "2026-11-04");
    expect(todayResult.todos).toHaveLength(1);
    expect(todayResult.todos[0].title).toBe("Pay electricity bill");
    expect(todayResult.todos[0].dueDate).toBe("2026-11-04");
    expect(todayResult.todos[0].isCarriedOver).toBe(true);
  });

  it("does not carry over completed tasks from past dates", async () => {
    const task = await createTodo(userA, {
      space: "personal",
      title: "Completed past task",
      dueDate: "2026-11-01",
      isRecurring: false,
      recurrencePattern: "none",
    });

    await toggleTodo(userA, {
      id: task.id,
      isCompleted: true,
      currentDate: "2026-11-01",
    });

    const todayResult = await getDailyTodos(userA, "personal", "2026-11-04");
    expect(todayResult.todos).toHaveLength(0);
  });

  it("tracks streak and consecutive completions accurately for recurring habits", async () => {
    const habit = await createTodo(userA, {
      space: "personal",
      title: "Daily Creatine 5g",
      dueDate: "2026-11-01",
      isRecurring: true,
      recurrencePattern: "daily",
    });

    expect(habit.isRecurring).toBe(true);
    expect(habit.streak).toBe(0);

    // Complete on Day 1
    await toggleTodo(userA, {
      id: habit.id,
      isCompleted: true,
      currentDate: "2026-11-01",
    });

    const day1Result = await getDailyTodos(userA, "personal", "2026-11-01");
    expect(day1Result.todos[0].isCompleted).toBe(true);
    expect(day1Result.todos[0].streak).toBe(1);

    // Complete on Day 2 (consecutive)
    await toggleTodo(userA, {
      id: habit.id,
      isCompleted: true,
      currentDate: "2026-11-02",
    });

    const day2Result = await getDailyTodos(userA, "personal", "2026-11-02");
    expect(day2Result.todos[0].isCompleted).toBe(true);
    expect(day2Result.todos[0].streak).toBe(2);

    // Skip to Day 5 (broken streak)
    await toggleTodo(userA, {
      id: habit.id,
      isCompleted: true,
      currentDate: "2026-11-05",
    });

    const day5Result = await getDailyTodos(userA, "personal", "2026-11-05");
    expect(day5Result.todos[0].isCompleted).toBe(true);
    expect(day5Result.todos[0].streak).toBe(1);
  });

  it("prevents cross-user task modification or deletion", async () => {
    const task = await createTodo(userA, {
      space: "personal",
      title: "Sensitive User A Task",
      dueDate: "2026-11-04",
      isRecurring: false,
      recurrencePattern: "none",
    });

    // User B tries to toggle
    const toggleByB = await toggleTodo(userB, {
      id: task.id,
      isCompleted: true,
      currentDate: "2026-11-04",
    });
    expect(toggleByB).toBe(false);

    // User B tries to delete
    const deleteByB = await deleteTodo(userB, task.id);
    expect(deleteByB).toBe(false);

    // User A can successfully delete
    const deleteByA = await deleteTodo(userA, task.id);
    expect(deleteByA).toBe(true);
  });

  it("calculates daily completion stats accurately", async () => {
    const t1 = await createTodo(userA, {
      space: "personal",
      title: "Task 1",
      dueDate: "2026-11-04",
      isRecurring: false,
      recurrencePattern: "none",
    });
    const t2 = await createTodo(userA, {
      space: "personal",
      title: "Task 2",
      dueDate: "2026-11-04",
      isRecurring: false,
      recurrencePattern: "none",
    });
    await createTodo(userA, {
      space: "personal",
      title: "Task 3",
      dueDate: "2026-11-04",
      isRecurring: false,
      recurrencePattern: "none",
    });

    await toggleTodo(userA, { id: t1.id, isCompleted: true, currentDate: "2026-11-04" });
    await toggleTodo(userA, { id: t2.id, isCompleted: true, currentDate: "2026-11-04" });

    const res = await getDailyTodos(userA, "personal", "2026-11-04");
    expect(res.stats.total).toBe(3);
    expect(res.stats.completed).toBe(2);
    expect(res.stats.percentage).toBe(67);
  });

  describe("Server Actions authorization & validation guards", () => {
    it("rejects unauthenticated requests", async () => {
      authState.id = "";

      await expect(
        createTodoAction({
          space: "personal",
          title: "Test",
          dueDate: "2026-11-04",
        }),
      ).rejects.toThrow("Authentication required.");

      await expect(
        toggleTodoAction({
          id: randomUUID(),
          isCompleted: true,
          currentDate: "2026-11-04",
        }),
      ).rejects.toThrow("Authentication required.");

      await expect(
        deleteTodoAction(randomUUID()),
      ).rejects.toThrow("Authentication required.");
    });

    it("executes server actions successfully for authenticated owner", async () => {
      authState.id = userA;

      const createRes = await createTodoAction({
        space: "personal",
        title: "Action Test Task",
        dueDate: "2026-11-04",
        reminderTime: "14:30",
        isRecurring: false,
      });

      expect(createRes.success).toBe(true);
      expect(createRes.todo.title).toBe("Action Test Task");
      expect(createRes.todo.reminderTime).toBe("14:30");

      const toggleRes = await toggleTodoAction({
        id: createRes.todo.id,
        isCompleted: true,
        currentDate: "2026-11-04",
      });
      expect(toggleRes.success).toBe(true);

      const listRes = await getDailyTodosAction("personal", "2026-11-04");
      expect(listRes.success).toBe(true);
      expect(listRes.todos).toHaveLength(1);
      expect(listRes.todos[0].isCompleted).toBe(true);

      const deleteRes = await deleteTodoAction(createRes.todo.id);
      expect(deleteRes.success).toBe(true);
      expect(deleteRes.deleted).toBe(true);

      const subRes = await savePushSubscriptionAction({
        endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
        p256dhKey: "sample-p256dh-val",
        authKey: "sample-auth-val",
      });
      expect(subRes.success).toBe(true);
      expect(subRes.subscription.endpoint).toContain("googleapis.com");
    });
  });
});
