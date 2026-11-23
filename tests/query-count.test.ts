import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The session carries a `sid` backed by a real `user_sessions` row: the session check is one of the counted queries.
const auth = vi.hoisted(() => ({ id: "", sid: "" }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { id: auth.id, name: "Load" }, sid: auth.sid }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirected"); }, notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/auth", () => ({ authOptions: {} }));
// A page view outside a request: no request headers (the Gym page reads its refresh number from them).
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { seedUser } from "./auth";
import { startSession } from "@/server/sessions";
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
  userId = await seedUser(`load-${randomUUID()}`);
  auth.id = userId;
  auth.sid = await startSession(userId, 180 * 24 * 60 * 60);
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

// Cost guards: a page view must not grow with the history, and the Neon and Vercel
// free limits count queries, rows and bytes. Measured with two years of data; the limits leave a little room.
// Every budget counts the session row check (D-041); /gym also leaves one for the plate weights.
describe("a page view with two years of data stays cheap", () => {
  const pages: [string, () => Promise<{ default: () => Promise<unknown> }>, number, number][] = [
    ["/gym", () => import("../app/gym/page"), 14, 300_000],
    // Weight sends at most 365 weigh-ins for its chart (the database keeps all), so the page is bounded by that, not by the history.
    ["/health", () => import("../app/health/page"), 13, 40_000],
    ["/todos", () => import("../app/todos/page"), 12, 20_000],
    ["/wishlist", () => import("../app/wishlist/page"), 4, 1_000],
  ];
  for (const [route, load, maxQueries, maxBytes] of pages) {
    it(`${route}: at most ${maxQueries} queries and ${maxBytes} bytes of props`, async () => {
      const page = await load();
      const { queries, bytes } = await measure(() => page.default());
      expect(queries, sent.map((q) => q.text.slice(0, 100)).join("\n")).toBeLessThanOrEqual(maxQueries);
      expect(bytes).toBeLessThanOrEqual(maxBytes);
    });
  }

  it("no action re-renders the page: every client keeps its own state", () => {
    // `providers.tsx` refreshes the router cache once the writes stop, so a write never has to revalidate a path.
    const actions = import.meta.glob("../src/actions/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    expect(Object.keys(actions).length).toBeGreaterThan(0);
    for (const [file, text] of Object.entries(actions)) expect(text, file).not.toContain("revalidatePath");
  });
});
