import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", async () => (await import("./auth")).authModule);
import { authState, seedUser } from "./auth";

import { addTodo, deleteTodo, getDailyTodos, restoreTodo, toggleTodo } from "@/lib/todos";
import { deleteCategory } from "@/lib/categories";
import { addDays, toISODate } from "@/lib/format-date";

const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

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

  // The order is read at millisecond precision: a person never creates or ticks two tasks in the same millisecond, a test can.
  const apart = async <T,>(run: () => Promise<T>) => {
    const result = await run();
    await new Promise((resolve) => setTimeout(resolve, 3));
    return result;
  };
  const add = (title: string, over: Record<string, unknown> = {}) =>
    apart(async () => (await addTodo(user, { space: "personal", title, dueDate: today, isRecurring: false, recurrencePattern: "none", ...over })).todo!);
  const daily = (title: string, space: "personal" | "business" = "personal", category = "other") =>
    add(title, { space, isRecurring: true, recurrencePattern: "daily", category });
  const titles = async (day = today, space: "personal" | "business" = "personal") =>
    (await getDailyTodos(user, space, day, today)).todos.map((t) => t.title);
  const tick = (id: string, isCompleted: boolean) => apart(() => toggleTodo(user, { id, isCompleted }));

  it("ticked goes to the top of the ticked, unticked to the bottom of the open, and nothing else moves", async () => {
    const a = await daily("A");
    const b = await daily("B");
    await daily("C");
    expect(await titles()).toEqual(["C", "B", "A"]);
    await tick(a.id, true);
    await tick(b.id, true);
    expect(await titles()).toEqual(["C", "B", "A"]);
    await tick(a.id, false);
    expect(await titles()).toEqual(["C", "A", "B"]); // A: bottom of the open ones
    await tick(a.id, true);
    expect(await titles()).toEqual(["C", "A", "B"]); // A: top of the ticked ones
    // Another day reads no tick of today: all open, newest first.
    expect(await titles(tomorrow)).toEqual(["C", "B", "A"]);
    expect(await titles(addDays(today, 3))).toEqual(["C", "B", "A"]);
  });

  it("an unticked task stays at the bottom of the open ones when the day is read again later", async () => {
    const a = await daily("A");
    await daily("B");
    await tick(a.id, true);
    await tick(a.id, false);
    expect(await titles()).toEqual(["B", "A"]);
    expect(await titles()).toEqual(["B", "A"]);
    expect(await titles()).toEqual(["B", "A"]);
  });

  it("a tick today never touches the order of another day", async () => {
    await daily("A");
    await daily("B");
    const c = await daily("C");
    await admin.query("UPDATE todos SET due_date = $1", [addDays(today, -3)]); // running since before yesterday
    await tick(c.id, true);
    expect(await titles(today)).toEqual(["B", "A", "C"]);
    expect(await titles(yesterday)).toEqual(["C", "B", "A"]);
    expect(await titles(tomorrow)).toEqual(["C", "B", "A"]);
  });

  it("personal and business share nothing, not even a name", async () => {
    const p = await daily("Same", "personal");
    const biz = await daily("Same", "business");
    await daily("P2", "personal");
    await daily("B2", "business");
    await tick(p.id, true);
    expect(await titles(today, "business")).toEqual(["B2", "Same"]);
    expect(await titles(today, "personal")).toEqual(["P2", "Same"]);
    await deleteTodo(user, p.id);
    expect(await titles(today, "business")).toEqual(["B2", "Same"]);
    expect((await getDailyTodos(user, "business", today, today)).todos.find((t) => t.id === biz.id)?.isCompleted).toBe(false);
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
    await tick(y2.id, true);
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

  it("Undo of a delete brings the task back in the same place", async () => {
    const a = await daily("A");
    const b = await daily("B");
    await daily("C");
    await tick(b.id, true);
    await tick(a.id, true);
    const before = await titles();
    const snap = (await getDailyTodos(user, "personal", today, today)).todos.find((t) => t.id === b.id)!;
    expect(await deleteTodo(user, b.id)).toBe(true);
    await restoreTodo(user, { ...snap, recurrencePattern: "daily" });
    expect(await titles()).toEqual(before);
  });
});
