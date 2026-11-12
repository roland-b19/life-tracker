import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { createTodo, deleteTodo, getDailyTodos, moveTodo, restoreTodo, toggleTodo } from "@/lib/todos";
import { deleteCategory } from "@/lib/categories";
import { addDays, toISODate } from "@/lib/format-date";

const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

async function seedUser(subject: string) {
  const [user] = await db
    .insert(users)
    .values({ issuer: "test", subject })
    .returning({ id: users.id });
  return user.id;
}


describe("Task order: only the user's own actions move a task", () => {
  const today = toISODate();
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);
  let user: string;

  beforeEach(async () => {
    await admin.query("TRUNCATE TABLE todos, push_subscriptions, users CASCADE");
    user = await seedUser(`user-${randomUUID()}`);
    authState.id = user;
  });
  afterAll(async () => {
    await admin.end();
  });

  const add = (title: string, over: Record<string, unknown> = {}) =>
    createTodo(user, { space: "personal", title, dueDate: today, isRecurring: false, recurrencePattern: "none", ...over });
  const daily = (title: string, space: "personal" | "business" = "personal", category = "other") =>
    add(title, { space, isRecurring: true, recurrencePattern: "daily", category });
  const titles = async (day = today, space: "personal" | "business" = "personal") =>
    (await getDailyTodos(user, space, day, today)).todos.map((t) => t.title);
  const tick = (id: string, day: string, isCompleted: boolean) => toggleTodo(user, { id, isCompleted, currentDate: day });

  it("ticked goes to the top of the ticked, unticked to the bottom of the open, and nothing else moves", async () => {
    const a = await daily("A");
    const b = await daily("B");
    await daily("C");
    expect(await titles()).toEqual(["C", "B", "A"]);
    await tick(a.id, today, true);
    await tick(b.id, today, true);
    expect(await titles()).toEqual(["C", "B", "A"]);
    await tick(a.id, today, false);
    expect(await titles()).toEqual(["C", "A", "B"]); // A: bottom of the open ones
    await tick(a.id, today, true);
    expect(await titles()).toEqual(["C", "A", "B"]); // A: top of the ticked ones
    // The same on the next day (it reads its own marks, not today's) and a day later still.
    expect(await titles(tomorrow)).toEqual(["C", "B", "A"]);
    expect(await titles(addDays(today, 3))).toEqual(["C", "B", "A"]);
  });

  it("an unticked task stays at the bottom of the open ones when the day is read again later", async () => {
    const a = await daily("A");
    await daily("B");
    await tick(a.id, today, true);
    await tick(a.id, today, false);
    expect(await titles()).toEqual(["B", "A"]);
    await admin.query("UPDATE todo_day_marks SET date = date"); // no-op: reading again changes nothing
    expect(await titles()).toEqual(["B", "A"]);
    expect(await titles()).toEqual(["B", "A"]);
  });

  it("a tick on one day never touches the order of another day", async () => {
    const a = await daily("A");
    const b = await daily("B");
    await admin.query("UPDATE todos SET due_date = $1", [addDays(today, -3)]); // running since before yesterday
    await tick(b.id, yesterday, true);
    await tick(a.id, today, true);
    expect(await titles(yesterday)).toEqual(["A", "B"]); // B ticked yesterday goes down; A open stays up
    expect(await titles(today)).toEqual(["B", "A"]);
    await tick(a.id, today, false);
    expect(await titles(yesterday)).toEqual(["A", "B"]);
    expect(await titles(tomorrow)).toEqual(["B", "A"]);
  });

  it("personal and business share nothing, not even a name", async () => {
    const p = await daily("Same", "personal");
    const biz = await daily("Same", "business");
    await daily("P2", "personal");
    await daily("B2", "business");
    await tick(p.id, today, true);
    expect(await titles(today, "business")).toEqual(["B2", "Same"]);
    expect(await titles(today, "personal")).toEqual(["P2", "Same"]);
    await deleteTodo(user, p.id, today);
    expect(await titles(today, "business")).toEqual(["B2", "Same"]);
    expect((await getDailyTodos(user, "business", today, today)).todos.find((t) => t.id === biz.id)?.isCompleted).toBe(false);
  });

  it("a task moved to Today or Daily goes above everything, carried-over tasks included, both ways", async () => {
    const old = await add("Old", { dueDate: yesterday });
    await admin.query("UPDATE todos SET created_at = $1 WHERE id = $2", [new Date(Date.now() - 2 * 86_400_000), old.id]);
    const fresh = await add("Fresh");
    const d = await daily("D");
    expect(await titles()).toEqual(expect.arrayContaining(["Old", "Fresh", "D"]));
    expect((await getDailyTodos(user, "personal", today, today)).todos.find((t) => t.title === "Old")?.isCarriedOver).toBe(true);
    // Daily -> Today: on top, above the carried one.
    await moveTodo(user, { id: d.id, recurrencePattern: "none", dueDate: today }, today);
    expect((await titles())[0]).toBe("D");
    // Today -> Daily: on top of its list.
    await moveTodo(user, { id: fresh.id, recurrencePattern: "daily", dueDate: today }, today);
    expect((await titles())[0]).toBe("Fresh");
    const dailyTitles = (await getDailyTodos(user, "personal", today, today)).todos.filter((t) => t.isRecurring).map((t) => t.title);
    expect(dailyTitles).toEqual(["Fresh"]);
    // Another move later puts that one on top again, above the earlier move.
    await moveTodo(user, { id: old.id, recurrencePattern: "none", dueDate: today }, today);
    expect((await titles())[0]).toBe("Old");
  });

  it("carried-over tasks land on top when carried; later additions sit above them", async () => {
    const o1 = await add("Old1", { dueDate: yesterday });
    await admin.query("UPDATE todos SET created_at = $1 WHERE id = $2", [new Date(Date.now() - 2 * 86_400_000), o1.id]);
    await add("New");
    expect(await titles()).toEqual(["Old1", "New"]); // carried at this moment: top
    await add("Newer");
    expect(await titles()).toEqual(["Newer", "Old1", "New"]);
    expect(await titles()).toEqual(["Newer", "Old1", "New"]); // reading again moves nothing
  });

  it("deleting a category lands its tasks on top of 'other' as a block; nothing else moves", async () => {
    await admin.query("INSERT INTO item_categories (user_id, scope, name, sort_order) VALUES ($1, 'personal', 'test', 1)", [user]);
    await daily("x1");
    await daily("x2");
    await daily("y1", "personal", "test");
    const y2 = await daily("y2", "personal", "test");
    await daily("y3", "personal", "test");
    await tick(y2.id, today, true);
    // Old, uneven placements: the block must still land together on top, nothing of "other" between its tasks.
    await admin.query("UPDATE todos SET placed_at = now() - interval '5 days' WHERE title = 'y1'");
    await admin.query("UPDATE todos SET placed_at = now() - interval '2 days' WHERE title IN ('x1', 'x2')");
    const inCategory = async (c: string) =>
      (await getDailyTodos(user, "personal", today, today)).todos.filter((t) => t.category === c).map((t) => t.title);
    expect(await inCategory("other")).toEqual(["x2", "x1"]);
    expect(await inCategory("test")).toEqual(["y3", "y1", "y2"]);
    await deleteCategory(user, "personal", "test");
    expect(await inCategory("other")).toEqual(["y3", "y1", "x2", "x1", "y2"]);
    expect(await inCategory("other")).toEqual(["y3", "y1", "x2", "x1", "y2"]); // reading again moves nothing
  });

  it("Undo of a delete and a move brings the task back in the same place", async () => {
    const a = await daily("A");
    const b = await daily("B");
    await daily("C");
    await tick(b.id, today, true);
    await tick(a.id, today, true);
    const before = await titles();
    const snap = (await getDailyTodos(user, "personal", today, today)).todos.find((t) => t.id === b.id)!;
    const gone = await deleteTodo(user, b.id, today);
    expect(gone).not.toBeNull();
    await restoreTodo(user, { ...snap, recurrencePattern: "daily", markDay: today }, gone?.join);
    expect(await titles()).toEqual(before);
  });
});
