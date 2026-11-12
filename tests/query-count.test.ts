import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: "" }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { id: auth.id, name: "Load" } }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirected"); }, notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/auth", () => ({ authOptions: {} }));

import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/db/schema";
import { getExercises, getUserSplitWithDays } from "@/lib/gym";
import { getShoppingCategories } from "@/lib/food";

const DAYS = 730; // about two years of history for one user

// Every query the app sends goes through Client.query, whether from pool.query or a transaction.
const sent: { text: string; ms: number }[] = [];
const original = Client.prototype.query;
async function measure<T>(run: () => Promise<T>) {
  sent.length = 0;
  const result = await run();
  return { result, queries: sent.length, bytes: JSON.stringify(result, (_, v) => (typeof v === "function" ? undefined : v)).length };
}

let userId = "";

beforeAll(async () => {
  const [u] = await db.insert(users).values({ issuer: "test", subject: `load-${randomUUID()}` }).returning({ id: users.id });
  userId = u.id;
  auth.id = userId;
  await getUserSplitWithDays(userId); // creates the routine
  await getExercises(userId);
  // A first visit seeds the shopping categories and units once; the guard measures every visit after it.
  await getShoppingCategories(userId);
  await getShoppingCategories(userId, "unit");
  const d = sql.raw(String(DAYS));
  const day = sql`(current_date - g)`;
  await db.execute(sql`INSERT INTO weight_entries (user_id, date, kilograms) SELECT ${userId}, ${day}, 85 FROM generate_series(0, ${d}) g`);
  await db.execute(sql`INSERT INTO daily_metrics (user_id, date, water_ml, steps) SELECT ${userId}, ${day}, 2000, 8000 FROM generate_series(0, ${d}) g`);
  await db.execute(sql`INSERT INTO meals (user_id, date, name, calories, protein, carbs, fat, is_estimated, created_at)
    SELECT ${userId}, ${day}, 'Meal ' || (g % 40) || '-' || m, 500, 30, 50, 15, false, ${day} + time '12:00'
    FROM generate_series(0, ${d}) g, generate_series(1, 3) m`);
  for (const space of ["personal", "business"]) {
    await db.execute(sql`INSERT INTO todos (user_id, space, title, is_recurring, recurrence_pattern, due_date, is_completed, created_at)
      SELECT ${userId}, ${space}, 'Task ' || g || '-' || t, false, 'none', ${day}, true, ${day}
      FROM generate_series(0, ${d}) g, generate_series(1, 2) t`);
  }
  await db.execute(sql`INSERT INTO workout_sessions (user_id, date, duration_minutes, is_deload, created_at)
    SELECT ${userId}, ${day}, 60, false, ${day} FROM generate_series(1, ${d}) g WHERE g % 2 = 0`);
  await db.execute(sql`INSERT INTO workout_sets (session_id, user_id, exercise_id, set_order, reps, load_type, load_value, extra_kg, created_at)
    SELECT s.id, ${userId}, e.id, k, 10, 'kg', 40, 0, s.created_at
    FROM workout_sessions s, (SELECT id FROM exercises ORDER BY id LIMIT 6) e, generate_series(1, 2) k WHERE s.user_id = ${userId}`);
  await db.execute(sql`ANALYZE`);
  Client.prototype.query = function (this: Client, ...args: unknown[]) {
    const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string })?.text ?? "";
    sent.push({ text, ms: 0 });
    return (original as (...a: unknown[]) => unknown).apply(this, args);
  } as typeof original;
}, 120_000);

afterAll(async () => {
  Client.prototype.query = original;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
  await admin.query("DELETE FROM users WHERE id = $1", [userId]); // cascades the two years of rows
  await admin.end();
});

// Cost guards (docs/release-plan.md section 6): a page view must not grow with the history, and the Neon and Vercel
// free limits count queries, rows and bytes. Measured with two years of data; the limits leave a little room.
describe("a page view with two years of data stays cheap", () => {
  const pages: [string, () => Promise<{ default: () => Promise<unknown> }>, number, number][] = [
    ["/gym", () => import("../app/gym/page"), 12, 300_000],
    // Weight sends at most 365 weigh-ins for its chart (the database keeps all), so the page is bounded by that, not by the history.
    ["/food", () => import("../app/food/page"), 12, 40_000],
    ["/todos", () => import("../app/todos/page"), 11, 20_000],
    ["/wishlist", () => import("../app/wishlist/page"), 3, 1_000],
  ];
  for (const [route, load, maxQueries, maxBytes] of pages) {
    it(`${route}: at most ${maxQueries} queries and ${maxBytes} bytes of props`, async () => {
      const page = await load();
      const { queries, bytes } = await measure(() => page.default());
      expect(queries, sent.map((q) => q.text.slice(0, 100)).join("\n")).toBeLessThanOrEqual(maxQueries);
      expect(bytes).toBeLessThanOrEqual(maxBytes);
    });
  }

  it("the todos page loads everything in one action, with few queries", async () => {
    const { loadTodosViewAction } = await import("@/app/actions/todos");
    const { result, queries, bytes } = await measure(() => loadTodosViewAction());
    expect(result.success).toBe(true);
    // 12 = the rollover update, the day's rows and the done dates, for 2 spaces and 2 views, plus history.
    expect(queries, sent.map((q) => q.text.slice(0, 100)).join("\n")).toBeLessThanOrEqual(12);
    expect(bytes).toBeLessThanOrEqual(20_000);
  });

  it("actions whose client keeps its own state do not re-render the page", () => {
    const src = (f: string) => readFileSync(`src/app/actions/${f}.ts`, "utf8");
    expect(src("wishlist")).not.toContain("revalidatePath");
    expect(src("todos")).not.toContain("revalidatePath");
    // Food actions hand back the new rows and the page keeps its own state; the response must not carry a re-rendered page.
    expect(src("food")).not.toContain("revalidatePath");
    expect(src("food-chat")).not.toContain("revalidatePath");
    const gym = src("gym");
    for (const fn of ["logSetAction", "deleteSetAction"]) {
      const body = gym.slice(gym.indexOf(`function ${fn}`)).split("\nexport ")[0];
      expect(body, fn).not.toContain("safeRevalidate");
    }
  });
});
