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

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { pushSubscriptions, todoCompletions, users } from "@/db/schema";
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
  loadTodosViewAction,
  restoreTodoAction,
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

  it("moves a ticked task to the top of the done ones and a just-unticked one to the bottom of the open ones", async () => {
    const ids: string[] = [];
    for (const title of ["A", "B", "C"]) {
      ids.push((await createTodo(userA, { space: "personal", title, dueDate: "2026-11-04", isRecurring: false, recurrencePattern: "none" })).id);
    }
    const [ia, ib] = ids;
    const titles = async () => (await getDailyTodos(userA, "personal", "2026-11-04", "2026-11-04")).todos.map((t) => t.title);
    await toggleTodo(userA, { id: ia, isCompleted: true, currentDate: "2026-11-04" });
    await toggleTodo(userA, { id: ib, isCompleted: true, currentDate: "2026-11-04" });
    expect(await titles()).toEqual(["C", "B", "A"]);
    await toggleTodo(userA, { id: ia, isCompleted: false, currentDate: "2026-11-04" });
    expect(await titles()).toEqual(["C", "A", "B"]);
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
    expect(await updateTodo(userB, { id: task.id, title: "Hijacked", reminderTime: null })).toBeNull();
    expect(await updateTodo(userA, { id: task.id, title: "Renamed", reminderTime: "08:30" })).toMatchObject({ title: "Renamed" });

    // User B tries to delete
    const deleteByB = await deleteTodo(userB, task.id);
    expect(deleteByB).toBeNull();

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

    it("keeps one row per endpoint when the same browser subscribes twice", async () => {
      vi.stubEnv("NEXT_PUBLIC_PUSH_ENABLED", "true");
      const endpoint = "https://fcm.googleapis.com/fcm/send/twice-endpoint";
      await savePushSubscriptionAction({ endpoint, p256dhKey: "old-p256dh", authKey: "old-auth" });
      await savePushSubscriptionAction({ endpoint, p256dhKey: "new-p256dh", authKey: "new-auth" });
      const rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
      expect(rows).toHaveLength(1);
      expect(rows[0].p256dhKey).toBe("new-p256dh");
      expect((await deletePushSubscriptionAction(endpoint)).deleted).toBe(true);
    });

    it("refuses a push endpoint that is not https", async () => {
      const keys = { p256dhKey: "sample-p256dh-val", authKey: "sample-auth-val" };
      await expect(savePushSubscriptionAction({ endpoint: "http://fcm.googleapis.com/x", ...keys })).rejects.toThrow();
      await expect(savePushSubscriptionAction({ endpoint: "ftp://example.com/x", ...keys })).rejects.toThrow();
    });

    it("adds one-off tasks for today only, with a day of slack either side", async () => {
      const today = toISODate();
      const task = (dueDate: string) => ({ space: "personal", title: "Plan", dueDate, isRecurring: false });
      expect((await createTodoAction(task(addDays(today, 1)))).success).toBe(true);
      await expect(createTodoAction(task(addDays(today, 2)))).rejects.toThrow("only be added or changed for today");
      await expect(createTodoAction(task(addDays(today, -5)))).rejects.toThrow("only be added or changed for today");
    });

    it("starts a repeating task today only, but Undo may bring an old one back", async () => {
      authState.id = userA;
      const today = toISODate();
      const habit = (dueDate: string) => ({ space: "personal", title: "Stretch", dueDate, isRecurring: true, recurrencePattern: "daily" });
      await expect(createTodoAction(habit(addDays(today, -400)))).rejects.toThrow("only be added or changed for today");
      await expect(createTodoAction(habit(addDays(today, 400)))).rejects.toThrow("only be added or changed for today");
      const made = await createTodoAction(habit(addDays(today, -1)));
      expect(made.success).toBe(true);
      // Undo of deleting a long-running habit keeps its real first day.
      if (!made.success) throw new Error(made.error);
      const old = { ...made.todo, dueDate: addDays(today, -400), id: randomUUID(), title: "Old habit", createdAt: new Date(), doneDates: [] as string[] };
      expect((await restoreTodoAction(old)).success).toBe(true);
    });

    it("rejects task titles that are only spaces", async () => {
      authState.id = userA;
      const today = toISODate();
      await expect(createTodoAction({ space: "personal", title: "   ", dueDate: today, isRecurring: false })).rejects.toThrow();
      const ok = await createTodoAction({ space: "personal", title: "  Pay rent  ", dueDate: today, isRecurring: false });
      if (!ok.success) throw new Error(ok.error);
      expect(ok.todo.title).toBe("Pay rent");
      await expect(updateTodoAction({ id: ok.todo.id, title: "\n\t " })).rejects.toThrow();
      await expect(createTodoAction({ space: "personal", title: "x".repeat(151), dueDate: today, isRecurring: false })).rejects.toThrow();
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
      expect((await tick(addDays(today, 5))).success).toBe(true); // a daily task is always ticked for today, whatever day was sent
      expect((await admin.query("SELECT date::text FROM todo_completions WHERE todo_id = $1", [habit.todo.id])).rows).toEqual([{ date: today }]);
      const later = await createTodo(userA, { space: "personal", title: "Later", dueDate: addDays(today, 3), isRecurring: true, recurrencePattern: "daily" });
      await expect(toggleTodoAction({ id: later.id, isCompleted: true, currentDate: today })).rejects.toThrow("not due today"); // before it starts

      // A one-off from before yesterday is frozen: not edited, deleted or ticked.
      const old = await createTodo(userA, {
        space: "personal", title: "Old", dueDate: addDays(today, -5), isRecurring: false, recurrencePattern: "none",
      });
      await expect(updateTodoAction({ id: old.id, title: "New" })).rejects.toThrow("only be added or changed for today");
      await expect(deleteTodoAction(old.id)).rejects.toThrow("only be added or changed for today");
      await expect(toggleTodoAction({ id: old.id, isCompleted: true, currentDate: addDays(today, -5) })).rejects.toThrow("only be added or changed for today");
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
      // A repeating task meets only the repeating tasks, never the one-off lists.
      const habit = { ...task, title: "Stretch", isRecurring: true, recurrencePattern: "daily" };
      expect((await createTodoAction(habit)).success).toBe(true);
      expect((await createTodoAction(habit)).success).toBe(false);
      expect((await createTodoAction({ ...habit, title: "STRETCH" })).success).toBe(false);
      expect((await createTodoAction({ ...task, title: "stretch" })).success).toBe(true);
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

    it("restores a ticked task with the time it was ticked, not the time of the Undo", async () => {
      const today = toISODate();
      const task = await createTodo(userA, { space: "personal", title: "Call", dueDate: today, isRecurring: false, recurrencePattern: "none" });
      await toggleTodo(userA, { id: task.id, isCompleted: true, currentDate: today });
      const [before] = (await getDailyTodos(userA, "personal", today)).todos;
      expect(before.completedAt).toBeTruthy();
      await new Promise((r) => setTimeout(r, 10));
      await deleteTodoAction(task.id);
      expect((await restoreTodoAction({ ...before, reminderTime: null })).success).toBe(true);
      const [back] = (await getDailyTodos(userA, "personal", today)).todos;
      expect(new Date(back.completedAt as unknown as string).getTime()).toBe(new Date(before.completedAt as unknown as string).getTime());
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

  });
  describe("Duplicate titles", () => {
    it("refuses a rename onto a title the list already has, owner only", async () => {
      const today = toISODate();
      const make = (title: string) => createTodo(userA, { space: "personal", title, dueDate: today, isRecurring: false, recurrencePattern: "none" });
      await make("Call mom");
      const b = await make("Pay rent");
      authState.id = "";
      await expect(updateTodoAction({ id: b.id, title: "x" })).rejects.toThrow("Authentication required.");
      authState.id = userB;
      expect(await updateTodoAction({ id: b.id, title: "Hijacked" })).toEqual({ success: false, todo: null });
      authState.id = userA;
      expect(await updateTodoAction({ id: b.id, title: "call MOM" })).toEqual({ success: false, error: '"call MOM" is already on this list.' });
      expect((await updateTodoAction({ id: b.id, title: "pay rent" })).success).toBe(true); // its own title, new case
    });
  });
  describe("List order", () => {
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

    it("keeps all four lists apart: personal and business, Today and Daily", async () => {
      const today = toISODate();
      const spaces = ["personal", "business"] as const;
      for (const space of spaces) {
        for (const isRecurring of [false, true]) {
          const res = await createTodoAction({ space, title: "Plan", dueDate: today, isRecurring, recurrencePattern: isRecurring ? "daily" : "none" });
          expect(res.success).toBe(true);
        }
      }
      for (const space of spaces) {
        const { todos } = await getDailyTodos(userA, space, today, today);
        expect(todos.map((t) => t.isRecurring).sort()).toEqual([false, true]);
      }
      // Deleting the business one-off leaves the other three exactly as they were.
      const business = (await getDailyTodos(userA, "business", today, today)).todos.find((t) => !t.isRecurring)!;
      expect((await deleteTodoAction(business.id)).deleted).toBe(true);
      expect((await getDailyTodos(userA, "business", today, today)).todos.map((t) => t.isRecurring)).toEqual([true]);
      expect((await getDailyTodos(userA, "personal", today, today)).todos).toHaveLength(2);
    });

    it("carries an overdue task onto a today whose Daily list has the same name", async () => {
      const today = toISODate();
      const yesterday = addDays(today, -1);
      const old = await createTodo(userA, { space: "personal", title: "Water plants", dueDate: yesterday, isRecurring: false, recurrencePattern: "none" });
      await admin.query("UPDATE todos SET created_at = now() - interval '1 day' WHERE id = $1", [old.id]);
      await createTodo(userA, { space: "personal", title: "water plants", dueDate: today, isRecurring: true, recurrencePattern: "daily" });
      const rows = (await getDailyTodos(userA, "personal", today, today)).todos;
      expect(rows.map((t) => t.isRecurring).sort()).toEqual([false, true]);
      expect(rows.some((t) => t.id === old.id)).toBe(true);
    });

  });

  describe("Daily tasks are one list, today's", () => {
    const today = toISODate();
    const yesterday = addDays(today, -1);
    const daily = (title: string, dueDate = today) =>
      createTodo(userA, { space: "personal", title, dueDate, isRecurring: true, recurrencePattern: "daily" });
    const titlesOn = async (day: string) => (await getDailyTodos(userA, "personal", day, today)).todos.map((t) => t.title);
    const ticks = async (id: string) => (await admin.query("SELECT date::text FROM todo_completions WHERE todo_id = $1 ORDER BY date", [id])).rows.map((r) => r.date);
    const snapOf = async (id: string) => ({ ...(await getDailyTodos(userA, "personal", today, today)).todos.find((t) => t.id === id)!, reminderTime: null });

    it("edits in place: same id, same ticks, same streak", async () => {
      const task = await daily("Walk", addDays(today, -5));
      for (const d of [-2, -1, 0]) await toggleTodo(userA, { id: task.id, isCompleted: true, currentDate: addDays(today, d) });
      const saved = await updateTodo(userA, { id: task.id, title: "Run", reminderTime: null });
      expect(saved).toMatchObject({ id: task.id, title: "Run", streak: 3 });
      expect(await ticks(task.id)).toEqual([-2, -1, 0].map((d) => addDays(today, d)));
      expect(await titlesOn(today)).toEqual(["Run"]);
    });

    it("ticks today whatever day the screen sent, and the tick orders today's list only", async () => {
      const a = await daily("A");
      await daily("B");
      expect((await toggleTodoAction({ id: a.id, isCompleted: true, currentDate: yesterday })).success).toBe(true);
      expect(await ticks(a.id)).toEqual([today]);
      expect(await titlesOn(today)).toEqual(["B", "A"]);
      await expect(toggleTodoAction({ id: (await daily("C", addDays(today, 3))).id, isCompleted: true, currentDate: today })).rejects.toThrow("not due today");
    });

    it("edit and delete actions: owner allowed, other user and anonymous denied", async () => {
      const task = await daily("Floss", addDays(today, -3));
      authState.id = userB;
      expect(await updateTodoAction({ id: task.id, title: "Hacked" })).toMatchObject({ success: false });
      expect(await deleteTodoAction(task.id)).toMatchObject({ deleted: false });
      expect(await restoreTodoAction({ ...(await snapOf(task.id)) })).toMatchObject({ success: false });
      authState.id = "";
      await expect(updateTodoAction({ id: task.id, title: "x" })).rejects.toThrow("Authentication required.");
      await expect(deleteTodoAction(task.id)).rejects.toThrow("Authentication required.");
      authState.id = userA;
      expect(await titlesOn(today)).toEqual(["Floss"]); // nothing of A's changed
      expect(await updateTodoAction({ id: task.id, title: "Floss well" })).toMatchObject({ success: true });
      expect(await titlesOn(today)).toEqual(["Floss well"]);
    });

    it("deleting a task that ran before today ends it today, and Undo gives back the same row", async () => {
      const task = await daily("Stretch", addDays(today, -4));
      for (const d of [-3, -1]) await toggleTodo(userA, { id: task.id, isCompleted: true, currentDate: addDays(today, d) });
      const before = await snapOf(task.id);
      const rowBefore = (await admin.query("SELECT * FROM todos WHERE id = $1", [task.id])).rows[0];
      expect(await deleteTodoAction(task.id)).toMatchObject({ success: true, deleted: true });
      expect(await titlesOn(today)).toEqual([]);
      expect(await titlesOn(addDays(today, 3))).toEqual([]);
      expect(await titlesOn(yesterday)).toEqual(["Stretch"]); // the days before keep it: history and streak stay
      expect(await ticks(task.id)).toEqual([-3, -1].map((d) => addDays(today, d)));

      expect((await restoreTodoAction(before)).success).toBe(true);
      expect(await titlesOn(today)).toEqual(["Stretch"]);
      expect((await admin.query("SELECT * FROM todos WHERE id = $1", [task.id])).rows[0]).toEqual(rowBefore);
      expect(await ticks(task.id)).toEqual([-3, -1].map((d) => addDays(today, d)));
      expect((await admin.query("SELECT count(*)::int AS n FROM todos WHERE user_id = $1 AND title = 'Stretch'", [userA])).rows[0].n).toBe(1);
    });

    it("deleting a task that started today removes it, and Undo gives it back", async () => {
      const task = await daily("Read");
      await toggleTodo(userA, { id: task.id, isCompleted: true, currentDate: today });
      const before = await snapOf(task.id);
      expect(await deleteTodo(userA, task.id)).toBe(true);
      expect(await deleteTodo(userB, task.id)).toBeNull();
      expect(await titlesOn(today)).toEqual([]);
      expect((await restoreTodoAction(before)).success).toBe(true);
      expect(await snapOf(task.id)).toMatchObject({ isCompleted: true, completedAt: before.completedAt });
    });

    it("a tick counts for the order only on the day it was made", async () => {
      const a = await daily("A", addDays(today, -2));
      const b = await daily("B", addDays(today, -2));
      await admin.query("UPDATE todos SET created_at = now() - interval '1 hour', placed_at = now() - interval '1 hour' WHERE id = $1", [a.id]);
      await toggleTodo(userA, { id: b.id, isCompleted: true, currentDate: today });
      expect(await titlesOn(today)).toEqual(["A", "B"]); // ticked goes down
      expect(await titlesOn(addDays(today, 1))).toEqual(["B", "A"]); // the tick does not order another day
      // A mark left by an earlier day is ignored today.
      await admin.query("UPDATE todos SET completed_at = now() - interval '2 days' WHERE id = $1", [a.id]);
      expect((await getDailyTodos(userA, "personal", today, today)).todos.find((t) => t.id === a.id)?.completedAt).toBeNull();
    });

    it("still refuses a change to a one-off task from before yesterday", async () => {
      const old = await createTodo(userA, { space: "personal", title: "Old", dueDate: addDays(today, -3), isRecurring: false, recurrencePattern: "none" });
      await expect(updateTodoAction({ id: old.id, title: "New" })).rejects.toThrow("only be added or changed for today");
      await expect(deleteTodoAction(old.id)).rejects.toThrow("only be added or changed for today");
    });
  });

  describe("loadTodosViewAction (the page's single read)", () => {
    it("returns both spaces and history for the owner only, always for today", async () => {
      const today = toISODate();
      await createTodo(userA, { space: "personal", title: "Mine", dueDate: today, isRecurring: false, recurrencePattern: "none" });
      await createTodo(userA, { space: "personal", title: "Habit", dueDate: today, isRecurring: true, recurrencePattern: "daily" });
      // A task planned for a later day (before Move was removed) stays out of today's list.
      await createTodo(userA, { space: "business", title: "Later", dueDate: addDays(today, 2), isRecurring: false, recurrencePattern: "none" });

      authState.id = userA;
      const view = await loadTodosViewAction();
      expect(view.daily[0].todos.map((t) => t.title).sort()).toEqual(["Habit", "Mine"]);
      expect(view.daily[1].todos).toEqual([]);
      expect(Array.isArray(view.history[0])).toBe(true);

      authState.id = userB;
      expect((await loadTodosViewAction()).daily[0].todos).toEqual([]);

      authState.id = "";
      await expect(loadTodosViewAction()).rejects.toThrow("Authentication required.");
    });
  });
});
