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
import { todoCompletions, users } from "@/db/schema";
import {
  createTodo,
  DONE_DATES_WINDOW_DAYS,
  deleteTodo,
  getDailyTodos,
  getTodoHistory,
  toggleTodo,
  updateTodo,
} from "@/lib/todos";
import {
  createTodoAction,
  deletePushSubscriptionAction,
  deleteTodoAction,
  getDailyTodosAction,
  getPlannedDaysAction,
  loadTodosViewAction,
  moveTodoAction,
  restoreTodoAction,
  revertMoveTodoAction,
  savePushSubscriptionAction,
  toggleTodoAction,
  updateTodoAction,
} from "@/app/actions/todos";
import { streakOn } from "@/lib/streak";
import { addDays, toISODate } from "@/lib/format-date";

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
    // It was made on its own day; a task added to a day already over is never carried over.
    await admin.query("UPDATE todos SET created_at = '2026-11-01T12:00:00Z' WHERE id = $1", [pastTask.id]);

    // Reading a past day (Nov 3, today = Nov 4) is read-only: nothing moves.
    const pastRead = await getDailyTodos(userA, "personal", "2026-11-03", "2026-11-04");
    expect(pastRead.todos).toHaveLength(0);
    expect(pastRead.stats.percentage).toBe(100);

    // Query on Nov 4
    const todayResult = await getDailyTodos(userA, "personal", "2026-11-04", "2026-11-04");
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

    const todayResult = await getDailyTodos(userA, "personal", "2026-11-04", "2026-11-04");
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

  it("keeps the streak through untick, re-tick, double ticks and missed days", async () => {
    const habit = await createTodo(userA, {
      space: "personal",
      title: "Read",
      dueDate: "2026-11-01",
      isRecurring: true,
      recurrencePattern: "daily",
    });
    const tick = (day: string, isCompleted = true) => toggleTodo(userA, { id: habit.id, isCompleted, currentDate: day });
    const view = async (day: string) => (await getDailyTodos(userA, "personal", day)).todos[0];

    await tick("2026-11-01");
    await tick("2026-11-02");
    await tick("2026-11-03");
    expect((await view("2026-11-03")).streak).toBe(3);

    // Untick takes back only today's tick; re-ticking lands on the same streak.
    await tick("2026-11-03", false);
    expect(await view("2026-11-03")).toMatchObject({ isCompleted: false, streak: 2 });
    await tick("2026-11-03");
    expect((await view("2026-11-03")).streak).toBe(3);

    // A double tick does not reset or double count.
    await tick("2026-11-03");
    expect((await view("2026-11-03")).streak).toBe(3);

    // Tick the next day: the run goes on.
    await tick("2026-11-04");
    expect((await view("2026-11-04")).streak).toBe(4);

    // Unticking a day that was not ticked changes nothing.
    await tick("2026-10-30", false);
    expect((await view("2026-11-04")).streak).toBe(4);

    // Past days can be unticked and ticked again after later days were ticked.
    await tick("2026-11-02", false);
    expect(await view("2026-11-02")).toMatchObject({ isCompleted: false, streak: 1 });
    expect((await view("2026-11-04")).streak).toBe(2);
    await tick("2026-11-02");
    expect(await view("2026-11-02")).toMatchObject({ isCompleted: true, streak: 2 });
    expect((await view("2026-11-04")).streak).toBe(4);

    // Tomorrow still shows the run; a whole missed day shows it broken.
    expect((await view("2026-11-05")).streak).toBe(4);
    expect((await view("2026-11-06")).streak).toBe(0);

    // A day left unticked breaks the run: the next tick starts again at 1.
    await tick("2026-11-06");
    expect((await view("2026-11-06")).streak).toBe(1);
  });

  it("computes streaks as pure functions, timezone-proof", () => {
    const done = (...days: string[]) => new Set(days);
    expect(streakOn(done(), "2026-03-01")).toBe(0);
    expect(streakOn(done("2026-03-01"), "2026-03-01")).toBe(1);
    // Month and leap-day boundaries.
    expect(streakOn(done("2028-02-28", "2028-02-29", "2028-03-01"), "2028-03-01")).toBe(3);
    expect(streakOn(done("2026-12-31", "2027-01-01"), "2027-01-01")).toBe(2);
    // An unticked today still shows yesterday's run; a missed day ends it.
    expect(streakOn(done("2026-03-04", "2026-03-05"), "2026-03-06")).toBe(2);
    expect(streakOn(done("2026-03-04", "2026-03-05"), "2026-03-07")).toBe(0);
    // A gap in the past splits the run.
    expect(streakOn(done("2026-03-01", "2026-03-03"), "2026-03-03")).toBe(1);
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30"); // DST change in Europe
  });

  it("never carries overdue tasks into a future day being planned", async () => {
    const overdue = await createTodo(userA, { space: "personal", title: "Overdue", dueDate: "2026-11-01", isRecurring: false, recurrencePattern: "none" });
    await admin.query("UPDATE todos SET created_at = '2026-11-01T12:00:00Z' WHERE id = $1", [overdue.id]);
    await createTodo(userA, { space: "personal", title: "Planned", dueDate: "2026-11-07", isRecurring: false, recurrencePattern: "none" });

    const future = await getDailyTodos(userA, "personal", "2026-11-07", "2026-11-04");
    expect(future.todos.map((t) => t.title)).toEqual(["Planned"]);
    const today = await getDailyTodos(userA, "personal", "2026-11-04", "2026-11-04");
    expect(today.todos.map((t) => [t.title, t.dueDate, t.isCarriedOver])).toEqual([["Overdue", "2026-11-04", true]]);
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

    // User B tries to edit
    expect(await updateTodo(userB, { id: task.id, title: "Hijacked", reminderTime: null })).toBe(false);
    expect(await updateTodo(userA, { id: task.id, title: "Renamed", reminderTime: "08:30" })).toBe(true);

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

  it("keeps a per-day history of finished tasks, owner only", async () => {
    const day = "2026-11-04";
    const a = await createTodo(userA, { space: "personal", title: "A", dueDate: day, isRecurring: false, recurrencePattern: "none" });
    await createTodo(userA, { space: "personal", title: "B", dueDate: day, isRecurring: false, recurrencePattern: "none" });
    await toggleTodo(userA, { id: a.id, isCompleted: true, currentDate: day });

    expect(await getTodoHistory(userA, "personal")).toContainEqual({ date: day, isRecurring: false, total: 2, done: 1 });
    expect(await getTodoHistory(userA, "business")).toEqual([]);
    expect(await getTodoHistory(userB, "personal")).toEqual([]);

    await deleteTodo(userA, a.id);
    expect(await getTodoHistory(userA, "personal")).toContainEqual({ date: day, isRecurring: false, total: 1, done: 0 });
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

      const today = toISODate();
      const createRes = await createTodoAction({
        space: "personal",
        title: "Action Test Task",
        dueDate: today,
        reminderTime: "14:30",
        isRecurring: false,
      });

      if (!createRes.success) throw new Error(createRes.error);
      expect(createRes.todo.title).toBe("Action Test Task");
      expect(createRes.todo.reminderTime).toBe("14:30");

      const toggleRes = await toggleTodoAction({
        id: createRes.todo.id,
        isCompleted: true,
        currentDate: today,
      });
      expect(toggleRes.success).toBe(true);

      const listRes = await getDailyTodosAction("personal", today);
      expect(listRes.success).toBe(true);
      expect(listRes.todos).toHaveLength(1);
      expect(listRes.todos[0].isCompleted).toBe(true);

      const deleteRes = await deleteTodoAction(createRes.todo.id);
      expect(deleteRes.success).toBe(true);
      expect(deleteRes.deleted).toBe(true);

      vi.stubEnv("NEXT_PUBLIC_PUSH_ENABLED", "true");
      const subRes = await savePushSubscriptionAction({
        endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
        p256dhKey: "sample-p256dh-val",
        authKey: "sample-auth-val",
      });
      expect(subRes.success).toBe(true);
      expect(subRes.subscription.endpoint).toContain("googleapis.com");
    });

    it("removes a push subscription for its owner only", async () => {
      vi.stubEnv("NEXT_PUBLIC_PUSH_ENABLED", "true");
      const endpoint = "https://fcm.googleapis.com/fcm/send/undo-endpoint";
      await savePushSubscriptionAction({ endpoint, p256dhKey: "sample-p256dh-val", authKey: "sample-auth-val" });
      authState.id = userB;
      expect((await deletePushSubscriptionAction(endpoint)).deleted).toBe(false);
      authState.id = "";
      await expect(deletePushSubscriptionAction(endpoint)).rejects.toThrow("Authentication required.");
      authState.id = userA;
      expect((await deletePushSubscriptionAction(endpoint)).deleted).toBe(true);
      expect((await deletePushSubscriptionAction(endpoint)).deleted).toBe(false);
    });

    it("refuses a push endpoint that is not https", async () => {
      const keys = { p256dhKey: "sample-p256dh-val", authKey: "sample-auth-val" };
      await expect(savePushSubscriptionAction({ endpoint: "http://fcm.googleapis.com/x", ...keys })).rejects.toThrow();
      await expect(savePushSubscriptionAction({ endpoint: "ftp://example.com/x", ...keys })).rejects.toThrow();
    });

    it("plans one-off tasks from today up to a week ahead only", async () => {
      const today = toISODate();
      const task = (dueDate: string) => ({ space: "personal", title: "Plan", dueDate, isRecurring: false });
      expect((await createTodoAction(task(addDays(today, 7)))).success).toBe(true);
      await expect(createTodoAction(task(addDays(today, 30)))).rejects.toThrow("up to 7 days ahead");
      await expect(createTodoAction(task(addDays(today, -5)))).rejects.toThrow("up to 7 days ahead");
    });

    it("refuses bad input and changes on days a task cannot change", async () => {
      authState.id = userA;
      const today = toISODate();
      await expect(getDailyTodosAction("other" as never, today)).rejects.toThrow();
      await expect(getDailyTodosAction("personal", "today")).rejects.toThrow();

      const habit = await createTodoAction({
        space: "personal", title: "Walk", dueDate: today, isRecurring: true, recurrencePattern: "daily",
      });
      if (!habit.success) throw new Error(habit.error);
      const tick = (currentDate: string) => toggleTodoAction({ id: habit.todo.id, isCompleted: true, currentDate });
      await expect(tick(addDays(today, 5))).rejects.toThrow("not due");
      await expect(tick(addDays(today, -1))).rejects.toThrow("not due"); // before it started
      expect((await tick(today)).success).toBe(true);

      // A one-off on a past day can be ticked, not edited.
      const old = await createTodo(userA, {
        space: "personal", title: "Old", dueDate: addDays(today, -5), isRecurring: false, recurrencePattern: "none",
      });
      await expect(updateTodoAction({ id: old.id, title: "New" })).rejects.toThrow("up to 7 days ahead");
      await expect(deleteTodoAction(old.id)).rejects.toThrow("up to 7 days ahead");
      expect((await toggleTodoAction({ id: old.id, isCompleted: true, currentDate: addDays(today, -5) })).success).toBe(true);
    });

    it("rejects a duplicate task on the same list, not on another list or user", async () => {
      const today = toISODate();
      const task = { space: "personal", title: "Buy milk", dueDate: today, isRecurring: false };
      expect((await createTodoAction(task)).success).toBe(true);
      const dup = await createTodoAction({ ...task, title: "  buy MILK " });
      expect(dup).toEqual({ success: false, error: '"buy MILK" is already on this list.' });
      // Another day, the other space, or another user is a different list.
      expect((await createTodoAction({ ...task, dueDate: addDays(today, 1) })).success).toBe(true);
      expect((await createTodoAction({ ...task, space: "business" })).success).toBe(true);
      authState.id = userB;
      expect((await createTodoAction(task)).success).toBe(true);
      authState.id = userA;
      // A repeating task meets the repeating tasks, and the one-off lists of the days it is due.
      const habit = { ...task, title: "Stretch", isRecurring: true, recurrencePattern: "daily" };
      expect((await createTodoAction(habit)).success).toBe(true);
      expect((await createTodoAction(habit)).success).toBe(false);
      expect((await createTodoAction({ ...task, title: "stretch" })).success).toBe(false);
      authState.id = "";
      await expect(createTodoAction(task)).rejects.toThrow("Authentication required");
    });

    it("restores a deleted task with its streak, owner only", async () => {
      const today = toISODate();
      const habit = await createTodo(userA, {
        space: "personal",
        title: "Stretch",
        dueDate: addDays(today, -2),
        isRecurring: true,
        recurrencePattern: "daily",
      });
      await toggleTodo(userA, { id: habit.id, isCompleted: true, currentDate: addDays(today, -1) });
      await toggleTodo(userA, { id: habit.id, isCompleted: true, currentDate: today });
      const [before] = (await getDailyTodos(userA, "personal", today)).todos;
      const input = { ...before, reminderTime: null };

      authState.id = "";
      await expect(restoreTodoAction(input)).rejects.toThrow("Authentication required.");

      // While the row exists, another user cannot take its id.
      authState.id = userB;
      expect((await restoreTodoAction(input)).success).toBe(false);
      expect((await getDailyTodos(userB, "personal", today)).todos).toHaveLength(0);

      authState.id = userA;
      await deleteTodoAction(habit.id);
      expect((await restoreTodoAction(input)).success).toBe(true);
      const [back] = (await getDailyTodos(userA, "personal", today)).todos;
      expect(back).toMatchObject({ id: habit.id, isCompleted: true, streak: 2, doneDates: [addDays(today, -1), today] });
    });

    it("undoes a move with the old state back, ticks included, and only for the owner", async () => {
      const today = toISODate();
      const yesterday = addDays(today, -1);
      const snapshot = async (id: string, day: string) => {
        const t = (await getDailyTodos(userA, "personal", day, today)).todos.find((x) => x.id === id);
        if (!t) throw new Error("missing");
        return { ...t, reminderTime: null };
      };
      const listed = async (day: string) => (await getDailyTodos(userA, "personal", day, today)).todos;

      // In place: a ticked one-off for tomorrow moves to the day after, then comes back ticked.
      const tomorrow = addDays(today, 1);
      const task = await createTodo(userA, { space: "personal", title: "Call", dueDate: tomorrow, isRecurring: false, recurrencePattern: "none" });
      await toggleTodo(userA, { id: task.id, isCompleted: true, currentDate: tomorrow });
      const before = await snapshot(task.id, tomorrow);
      await moveTodoAction({ id: task.id, recurrencePattern: "none", dueDate: addDays(today, 2) });
      authState.id = userB;
      expect((await revertMoveTodoAction(before)).success).toBe(false);
      authState.id = userA;
      expect((await revertMoveTodoAction(before)).success).toBe(true);
      expect(await listed(tomorrow)).toMatchObject([{ id: task.id, isCompleted: true }]);
      expect(await listed(addDays(today, 2))).toHaveLength(0);

      // A daily task with past days becomes a new one-off; the undo deletes that one and un-ends the old one.
      const habit = await createTodo(userA, { space: "personal", title: "Inbox zero", dueDate: yesterday, isRecurring: true, recurrencePattern: "daily" });
      await toggleTodo(userA, { id: habit.id, isCompleted: true, currentDate: yesterday });
      await toggleTodo(userA, { id: habit.id, isCompleted: true, currentDate: today });
      const habitBefore = await snapshot(habit.id, today);
      const moved = await moveTodoAction({ id: habit.id, recurrencePattern: "none", dueDate: today });
      if (!moved.success || !moved.todo) throw new Error("move failed");
      expect((await listed(today)).map((t) => t.id)).toEqual([moved.todo.id]);
      const undone = await revertMoveTodoAction(habitBefore, moved.todo.id);
      expect(undone.success).toBe(true);
      expect((await listed(today)).map((t) => t.id)).toEqual([habit.id]);
      expect(await listed(today)).toMatchObject([{ isRecurring: true, isCompleted: true, doneDates: [yesterday, today] }]);
    });

    it("loads only the last DONE_DATES_WINDOW_DAYS of ticks for a daily task", async () => {
      const today = toISODate();
      const habit = await createTodo(userA, {
        space: "personal",
        title: "Old habit",
        dueDate: addDays(today, -1000),
        isRecurring: true,
        recurrencePattern: "daily",
      });
      const old = addDays(today, -(DONE_DATES_WINDOW_DAYS + 1));
      const edge = addDays(today, -DONE_DATES_WINDOW_DAYS);
      await db.insert(todoCompletions).values([old, edge, today].map((date) => ({ todoId: habit.id, date })));
      const [item] = (await getDailyTodos(userA, "personal", today)).todos;
      expect(item.doneDates).toEqual([edge, today]);
    });

    it("ends a deleted daily task today but keeps it on the days before, owner only", async () => {
      const today = toISODate();
      const yesterday = addDays(today, -1);
      const habit = await createTodo(userA, { space: "personal", title: "Stretch", dueDate: addDays(today, -3), isRecurring: true, recurrencePattern: "daily" });
      await admin.query("UPDATE todos SET created_at = now() - interval '3 days' WHERE id = $1", [habit.id]);
      await toggleTodo(userA, { id: habit.id, isCompleted: true, currentDate: yesterday });
      await toggleTodo(userA, { id: habit.id, isCompleted: true, currentDate: today });
      const [before] = (await getDailyTodos(userA, "personal", today)).todos;
      const input = { ...before, reminderTime: null };
      const ids = async (day: string) => (await getDailyTodos(userA, "personal", day, today)).todos.map((t) => t.id);

      authState.id = userB;
      expect((await deleteTodoAction(habit.id)).deleted).toBe(false);
      expect(await ids(today)).toEqual([habit.id]);

      authState.id = userA;
      expect((await deleteTodoAction(habit.id)).deleted).toBe(true);
      expect(await ids(today)).toEqual([]);
      expect(await ids(addDays(today, 1))).toEqual([]);
      const [past] = (await getDailyTodos(userA, "personal", yesterday, today)).todos;
      expect(past).toMatchObject({ id: habit.id, isCompleted: true, doneDates: [yesterday] });
      expect(await getTodoHistory(userA, "personal")).toContainEqual({ date: yesterday, isRecurring: true, total: 1, done: 1 });

      // An ended task is not a duplicate, but it cannot come back while a new one has its title.
      const again = await createTodoAction({ space: "personal", title: "stretch", dueDate: today, isRecurring: true, recurrencePattern: "daily" });
      if (!again.success) throw new Error(again.error);
      expect(await restoreTodoAction(input)).toEqual({ success: false, error: '"Stretch" is already on this list.' });
      await deleteTodo(userA, again.todo.id);

      authState.id = userB;
      expect((await restoreTodoAction(input)).success).toBe(false);
      expect(await ids(today)).toEqual([]);

      authState.id = userA;
      expect((await restoreTodoAction(input)).success).toBe(true);
      const [back] = (await getDailyTodos(userA, "personal", today)).todos;
      expect(back).toMatchObject({ id: habit.id, isCompleted: true, streak: 2, doneDates: [yesterday, today] });
    });

    it("rejects a rename or move onto a title the list already has, owner only", async () => {
      const today = toISODate();
      const tomorrow = addDays(today, 1);
      const make = (title: string, dueDate = today) =>
        createTodo(userA, { space: "personal", title, dueDate, isRecurring: false, recurrencePattern: "none" });
      await make("Call mom");
      const b = await make("Pay rent");
      const later = await make("Call mom", tomorrow);

      authState.id = "";
      await expect(updateTodoAction({ id: b.id, title: "x" })).rejects.toThrow("Authentication required.");
      authState.id = userB;
      expect(await updateTodoAction({ id: b.id, title: "Hijacked" })).toEqual({ success: false });

      authState.id = userA;
      expect(await updateTodoAction({ id: b.id, title: "call MOM" })).toEqual({ success: false, error: '"call MOM" is already on this list.' });
      expect((await updateTodoAction({ id: b.id, title: "pay rent" })).success).toBe(true); // its own title, new case
      expect(await moveTodoAction({ id: later.id, recurrencePattern: "none", dueDate: today })).toEqual({
        success: false,
        error: '"Call mom" is already on this list.',
      });
      expect((await moveTodoAction({ id: later.id, recurrencePattern: "daily", dueDate: today })).success).toBe(false);
      expect((await moveTodoAction({ id: later.id, recurrencePattern: "none", dueDate: addDays(today, 2) })).success).toBe(true);
    });
  });
  describe("List order, moves and planned days", () => {
    it("rejects a malformed repeat pattern", async () => {
      const task = { space: "personal", title: "Bad", dueDate: toISODate(), isRecurring: true };
      await expect(createTodoAction({ ...task, recurrencePattern: "weekly" })).rejects.toThrow();
      await expect(createTodoAction({ ...task, recurrencePattern: "weekly; drop" })).rejects.toThrow();
    });

    it("puts new tasks first and done tasks last, the most recently done first", async () => {
      const day = toISODate();
      const make = (title: string) => createTodo(userA, { space: "personal", title, dueDate: day, isRecurring: false, recurrencePattern: "none" });
      const a = await make("A");
      const b = await make("B");
      await make("C");
      await new Promise((r) => setTimeout(r, 5));
      await make("D");
      await toggleTodo(userA, { id: a.id, isCompleted: true, currentDate: day });
      await new Promise((r) => setTimeout(r, 5));
      await toggleTodo(userA, { id: b.id, isCompleted: true, currentDate: day });
      const order = (await getDailyTodos(userA, "personal", day, day)).todos.map((t) => t.title);
      expect(order).toEqual(["D", "C", "B", "A"]);
    });

    it("moves a task between days and kinds, owner only", async () => {
      const today = toISODate();
      const tomorrow = addDays(today, 1);
      const task = await createTodo(userA, { space: "personal", title: "Call", dueDate: today, isRecurring: false, recurrencePattern: "none" });
      const toTomorrow = { id: task.id, recurrencePattern: "none", dueDate: tomorrow };

      authState.id = "";
      await expect(moveTodoAction(toTomorrow)).rejects.toThrow("Authentication required.");

      authState.id = userB;
      expect((await moveTodoAction(toTomorrow)).success).toBe(false);
      expect((await getDailyTodos(userA, "personal", today, today)).todos.map((t) => t.id)).toEqual([task.id]);

      authState.id = userA;
      await expect(moveTodoAction({ ...toTomorrow, dueDate: addDays(today, 30) })).rejects.toThrow("up to 7 days ahead");
      expect((await moveTodoAction(toTomorrow)).success).toBe(true);
      expect((await getDailyTodos(userA, "personal", today, today)).todos).toHaveLength(0);
      expect((await getDailyTodos(userA, "personal", tomorrow, today)).todos[0]).toMatchObject({ id: task.id, isRecurring: false });

      // One-off to repeating and back.
      await moveTodoAction({ id: task.id, recurrencePattern: "daily", dueDate: today });
      expect((await getDailyTodos(userA, "personal", today, today)).todos[0]).toMatchObject({ id: task.id, isRecurring: true, streak: 0 });
      await moveTodoAction({ id: task.id, recurrencePattern: "none", dueDate: today });
      expect((await getDailyTodos(userA, "personal", tomorrow, today)).todos).toHaveLength(0);
      expect((await getDailyTodos(userA, "personal", today, today)).todos[0]).toMatchObject({ id: task.id, isRecurring: false });
    });

    it("turns a daily task with past days into a one-off without taking it off those days", async () => {
      const today = toISODate();
      const yesterday = addDays(today, -1);
      const habit = await createTodo(userA, { space: "business", title: "Inbox zero", dueDate: yesterday, isRecurring: true, recurrencePattern: "daily" });
      await admin.query("UPDATE todos SET created_at = now() - interval '1 day' WHERE id = $1", [habit.id]);
      await toggleTodo(userA, { id: habit.id, isCompleted: true, currentDate: yesterday });

      const res = await moveTodoAction({ id: habit.id, recurrencePattern: "none", dueDate: today });
      if (!res.success || !res.todo) throw new Error("move failed");
      expect(res.todo).toMatchObject({ title: "Inbox zero", isRecurring: false, dueDate: today });
      expect(res.todo.id).not.toBe(habit.id);
      const list = async (day: string) => (await getDailyTodos(userA, "business", day, today)).todos;
      expect((await list(today)).map((t) => t.id)).toEqual([res.todo.id]);
      expect(await list(yesterday)).toMatchObject([{ id: habit.id, isCompleted: true }]);
    });

    it("does not carry an overdue task onto a today that already has it", async () => {
      const today = toISODate();
      const yesterday = addDays(today, -1);
      const make = (title: string, dueDate: string) =>
        createTodo(userA, { space: "personal", title, dueDate, isRecurring: false, recurrencePattern: "none" });
      const old = await make("Water plants", yesterday);
      const other = await make("Post letter", yesterday);
      await admin.query("UPDATE todos SET created_at = now() - interval '1 day' WHERE id = ANY($1)", [[old.id, other.id]]);
      const fresh = await make("water plants", today);
      const ids = (await getDailyTodos(userA, "personal", today, today)).todos.map((t) => t.id).sort();
      expect(ids).toEqual([other.id, fresh.id].sort());
      expect((await getDailyTodos(userA, "personal", yesterday, today)).todos.map((t) => t.id)).toEqual([old.id]);
    });

    it("shows a daily task from its first day on, and keeps a task added to a past day there", async () => {
      const today = toISODate();
      const yesterday = addDays(today, -1);
      const habit = await createTodo(userA, { space: "personal", title: "Floss", dueDate: today, isRecurring: true, recurrencePattern: "daily" });
      const late = await createTodo(userA, { space: "personal", title: "Late", dueDate: yesterday, isRecurring: false, recurrencePattern: "none" });
      const titles = async (day: string) => (await getDailyTodos(userA, "personal", day, today)).todos.map((t) => t.title).sort();
      expect(await titles(yesterday)).toEqual(["Late"]);
      expect(await titles(today)).toEqual(["Floss"]);
      expect(await titles(addDays(today, 3))).toEqual(["Floss"]);
      expect(await titles(yesterday)).toEqual(["Late"]); // reading today did not carry it over
      expect(habit.id && late.id).toBeTruthy();
    });

    it("deletes a daily task from the day given on, keeping the days before it", async () => {
      const today = toISODate();
      const habit = await createTodo(userA, { space: "personal", title: "Walk", dueDate: addDays(today, -3), isRecurring: true, recurrencePattern: "daily" });
      await toggleTodo(userA, { id: habit.id, isCompleted: true, currentDate: addDays(today, -1) });
      expect(await deleteTodo(userB, habit.id, addDays(today, -1))).toBe(false);
      expect(await deleteTodo(userA, habit.id, addDays(today, -1))).toBe(true);
      const ids = async (day: string) => (await getDailyTodos(userA, "personal", day, today)).todos.map((t) => t.id);
      expect(await ids(addDays(today, -2))).toEqual([habit.id]);
      expect(await ids(addDays(today, -1))).toEqual([]);
      expect(await ids(today)).toEqual([]);
    });

    it("lists future planned days for the owner only", async () => {
      const today = toISODate();
      const plan = (dueDate: string, isRecurring = false) =>
        createTodo(userA, { space: "personal", title: "P", dueDate, isRecurring, recurrencePattern: isRecurring ? "daily" : "none" });
      await plan(addDays(today, 2));
      await plan(addDays(today, 2));
      await plan(addDays(today, 5));
      await plan(addDays(today, 3), true); // repeating tasks never mark a day

      authState.id = "";
      await expect(getPlannedDaysAction("personal")).rejects.toThrow("Authentication required.");
      authState.id = userB;
      expect((await getPlannedDaysAction("personal")).days).toEqual([]);
      authState.id = userA;
      expect((await getPlannedDaysAction("personal")).days).toEqual([addDays(today, 2), addDays(today, 5)]);
      expect((await getPlannedDaysAction("business")).days).toEqual([]);
    });
  });

  describe("loadTodosViewAction (the page's single read)", () => {
    it("returns both spaces, history and planned days for the owner only", async () => {
      const today = toISODate();
      await createTodo(userA, { space: "personal", title: "Mine", dueDate: today, isRecurring: false, recurrencePattern: "none" });
      await createTodo(userA, { space: "business", title: "Work", dueDate: addDays(today, 2), isRecurring: false, recurrencePattern: "none" });
      await createTodo(userA, { space: "personal", title: "Habit", dueDate: today, isRecurring: true, recurrencePattern: "daily" });

      authState.id = userA;
      const view = await loadTodosViewAction(today);
      expect(view.daily[0].todos.map((t) => t.title).sort()).toEqual(["Habit", "Mine"]);
      expect(view.daily[1].todos).toEqual([]);
      expect(view.planned[1]).toEqual([addDays(today, 2)]);
      expect(Array.isArray(view.history[0])).toBe(true);

      authState.id = userB;
      const other = await loadTodosViewAction(today);
      expect(other.daily[0].todos).toEqual([]);
      expect(other.planned).toEqual([[], []]);

      authState.id = "";
      await expect(loadTodosViewAction(today)).rejects.toThrow("Authentication required.");
      authState.id = userA;
      await expect(loadTodosViewAction("2026-02-30")).rejects.toThrow();
    });
  });
});
