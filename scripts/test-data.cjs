/* eslint-disable @typescript-eslint/no-require-imports */
// Adds a clearly marked, extensive set of test data to one account: 45 days back, today and (for tasks) 7 days ahead, on every page,
// so each page can be tried by hand, including same-named tasks in all four lists (personal/business x Today/Daily). Everything it adds starts with "TEST" and its ids are written to .local/test-data-<subject>.json,
// so `--remove` deletes exactly those rows and nothing else. It never changes or deletes a row that was already there:
// a weigh-in or a water/steps day that exists is left as it is, and only what this script inserted is recorded.
// Usage: DATABASE_URL_MIGRATE=<owner url> node scripts/test-data.cjs --subject <id> [--issuer <issuer>] [--dry-run | --remove]
// Run the backup first (README, "Test data"). Health and Gym only get past days and today: the app does not log the future,
// and Tasks can be planned a week ahead only.
const fs = require("node:fs");
const { Client } = require("pg");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const dryRun = flag("--dry-run");
const remove = flag("--remove");
const issuer = option("--issuer", "https://github.com");
const subject = option("--subject", "");
const url = process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL || "";
if (!subject) throw new Error("Pass --subject <your GitHub numeric id>.");
if (!url) throw new Error("Set DATABASE_URL_MIGRATE to the owner connection string.");
const idsFile = `.local/test-data-${subject.replace(/\W/g, "_")}.json`;

// The app's calendar day (Europe/Bucharest), as APP_TZ in src/lib/format-date.ts; day math in UTC so DST never skips a day.
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (iso) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = Monday, as the app
const label = (n) => (n === 0 ? "today" : n < 0 ? `${-n} days ago` : `in ${n} days`);
const PAST = 45; // days of history
const AHEAD = 7; // the planner's limit
const OFFSETS = Array.from({ length: PAST + AHEAD + 1 }, (_, i) => i - PAST);
const pick = (n, k, pct) => (Math.abs(n * 7919 + k * 104729 + 13) % 100) < pct; // deterministic "random", so a run is repeatable
const TABLES = ["todos", "weight_entries", "daily_metrics", "meals", "shopping_items", "wishlist_items", "workout_sessions"];

async function removeAll(db, userId) {
  if (!fs.existsSync(idsFile)) throw new Error(`${idsFile} not found: nothing recorded to remove.`);
  const rec = JSON.parse(fs.readFileSync(idsFile, "utf8"));
  const gone = [];
  for (const table of TABLES) {
    const { rowCount } = await db.query(`DELETE FROM ${table} WHERE user_id = $1 AND id = ANY($2::uuid[])`, [userId, rec[table] ?? []]);
    gone.push(`${table} ${rowCount}`);
  }
  for (const s of rec.stats ?? []) {
    const q = s.before
      ? ["UPDATE todo_day_stats SET total = $5, done = $6 WHERE user_id = $1 AND space = $2 AND is_recurring = $3 AND date = $4", [userId, s.space, s.recurring, s.date, s.before.total, s.before.done]]
      : ["DELETE FROM todo_day_stats WHERE user_id = $1 AND space = $2 AND is_recurring = $3 AND date = $4", [userId, s.space, s.recurring, s.date]];
    await db.query(...q);
  }
  for (const [scope, name] of rec.categories ?? []) await db.query("DELETE FROM item_categories WHERE user_id = $1 AND scope = $2 AND name = $3", [userId, scope, name]);
  console.log(`removed: ${gone.join(", ")}, ${(rec.stats ?? []).length} day totals reset, ${(rec.categories ?? []).length} categories`);
  return rec;
}

async function addAll(db, userId) {
  if (fs.existsSync(idsFile)) throw new Error(`${idsFile} exists: the test data is already there. Run with --remove first.`);
  const rec = Object.fromEntries([...TABLES.map((t) => [t, []]), ["stats", []], ["categories", []]]);
  const insert = async (table, sql, params) => {
    const { rows } = await db.query(`${sql} RETURNING id`, params);
    if (rows[0]) rec[table].push(rows[0].id);
    return rows[0]?.id;
  };

  // One category per list, so the category cards and filters can be tried.
  for (const scope of ["wishlist", "personal", "business"])
    for (const name of ["test", "test two"]) {
      const { rowCount } = await db.query(
        `INSERT INTO item_categories (user_id, scope, name, sort_order)
         SELECT $1::uuid, $2::varchar, $3::varchar, coalesce(max(sort_order), 0) + 1 FROM item_categories WHERE user_id = $1::uuid AND scope = $2::varchar
         ON CONFLICT DO NOTHING`,
        [userId, scope, name],
      );
      if (rowCount) rec.categories.push([scope, name]);
    }

  // Tasks: a one-off per day and space (past ones done, yesterday's left open), and daily or weekday habits that started 3 days ago.
  const stats = new Map(); // "space|recurring|day" -> { total, done }
  const tally = (space, recurring, day, done) => {
    const key = `${space}|${recurring}|${day}`;
    const s = stats.get(key) ?? { total: 0, done: 0 };
    s.total++;
    if (done) s.done++;
    stats.set(key, s);
  };
  const addTodo = (space, title, recurring, pattern, due, done, category = "test") =>
    insert(
      "todos",
      `INSERT INTO todos (user_id, space, title, is_recurring, recurrence_pattern, due_date, is_completed, completed_at, created_at, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 THEN $6::date + time '18:00' END, CASE WHEN $6::date > current_date THEN now() ELSE $6::date + time '08:00' END, $8)`,
      [userId, space, title, recurring, pattern, due, done, category],
    );
  // One-offs: 2 personal and 1 business on every day. Past ones are done, except some of yesterday's (the app carries open ones to today).
  for (const n of OFFSETS) {
    const day = addDays(today, n);
    for (const [space, count] of [["personal", 2], ["business", 1]])
      for (let k = 0; k < count; k++) {
        const done = n < -1 || (n === -1 && k === 0) || (n === 0 && k === 0 && space === "personal");
        await addTodo(space, `TEST ${space} task ${label(n)}${count > 1 ? ` (${k + 1})` : ""}`, false, "none", day, done, k % 2 ? "test two" : "test");
        if (n < 0) tally(space, false, day, done);
      }
  }
  // The same name in all four lists (personal/business x Today/Daily): none may block another, and each can be moved on its own.
  const startAll = addDays(today, -PAST);
  for (const space of ["personal", "business"]) {
    await addTodo(space, "TEST same name", false, "none", today, false);
    await addTodo(space, "TEST same name", false, "none", addDays(today, 2), false);
  } // ...and the Daily one of each space is in the habits below
  // Habits (the app only knows "daily" and "none", so no weekday patterns). Each ticked day is recorded; a habit's ticks are random but repeatable, with the last 12 days of the first one all done (a streak).
  const habits = [
    ["personal", "TEST daily habit", "daily", startAll, null],
    ["personal", "TEST second habit", "daily", startAll, null],
    ["personal", "TEST same name", "daily", addDays(today, -10), null],
    ["business", "TEST same name", "daily", addDays(today, -10), null],
    ["business", "TEST daily review", "daily", startAll, null],
    ["business", "TEST standup", "daily", startAll, null],
    ["personal", "TEST ended habit", "daily", startAll, addDays(today, -15)], // stopped 15 days ago: its days before stay in the history
  ];
  for (const [h, [space, title, pattern, first, endedOn]] of habits.entries()) {
    const id = await addTodo(space, title, true, pattern, first, false);
    if (endedOn) await db.query("UPDATE todos SET ended_on = $2 WHERE id = $1", [id, endedOn]);
    for (const n of OFFSETS.filter((o) => o <= -1)) {
      const day = addDays(today, n);
      if (day < first || (endedOn && day >= endedOn)) continue;
      if (pattern !== "daily" && !pattern.slice(5).split(",").includes(String(weekday(day)))) continue;
      const done = (h === 0 && n >= -12) || pick(n, h, 70);
      if (done) await db.query("INSERT INTO todo_completions (todo_id, date) VALUES ($1, $2)", [id, day]);
      tally(space, true, day, done);
    }
  }
  // The frozen per-day totals the Progress chart reads; an existing day is added to, and its old numbers are kept for --remove.
  for (const [key, s] of stats) {
    const [space, recurring, day] = key.split("|");
    const rc = recurring === "true";
    const { rows } = await db.query("SELECT total, done FROM todo_day_stats WHERE user_id = $1 AND space = $2 AND is_recurring = $3 AND date = $4", [userId, space, rc, day]);
    await db.query(
      `INSERT INTO todo_day_stats (user_id, space, is_recurring, date, total, done) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, space, is_recurring, date) DO UPDATE SET total = todo_day_stats.total + EXCLUDED.total, done = todo_day_stats.done + EXCLUDED.done`,
      [userId, space, rc, day, s.total, s.done],
    );
    rec.stats.push({ space, recurring: rc, date: day, before: rows[0] ?? null });
  }

  // Health: past days and today. An existing weigh-in or water/steps day is never touched (ON CONFLICT DO NOTHING records nothing).
  for (const n of OFFSETS.filter((o) => o <= 0)) {
    const day = addDays(today, n);
    await insert("weight_entries", "INSERT INTO weight_entries (user_id, date, kilograms) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [userId, day, (80 + n * 0.08 + (pick(n, 1, 50) ? 0.3 : -0.2)).toFixed(2)]);
    await insert("daily_metrics", "INSERT INTO daily_metrics (user_id, date, water_ml, steps) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [userId, day, 1200 + Math.abs(n * 137) % 1600, 4000 + Math.abs(n * 911) % 9000]);
    for (const [slot, time, kcal, protein, carbs, fat] of [["breakfast", "08:00", 420, 14, 72, 8], ["lunch", "13:00", 620, 55, 75, 10], ...(n < 0 ? [["dinner", "19:30", 650, 42, 50, 28]] : []), ...(pick(n, 2, 40) ? [["snack", "16:00", 210, 6, 24, 9]] : [])])
      await insert("meals", "INSERT INTO meals (user_id, date, name, calories, protein, carbs, fat, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $2::date + $8::time)", [userId, day, `TEST ${slot} ${label(n)}`, kcal, protein, carbs, fat, time]);
  }

  // Shopping list and wishlist.
  const groceries = ["bread", "milk", "apples", "eggs", "rice", "chicken", "yogurt", "oats", "tomatoes", "coffee", "olive oil", "bananas"];
  for (const [i, name] of groceries.entries())
    await insert("shopping_items", "INSERT INTO shopping_items (user_id, name, amount, unit, category, is_bought, created_at) VALUES ($1, $2, $3, 'pcs', 'other', $4, now() - make_interval(mins => $5::int))", [userId, `TEST ${name}`, 1 + (i % 3), i % 3 === 2, i]);
  const wishes = [["headphones", 1100], ["desk lamp", 90], ["running shoes", 320], ["backpack", 180], ["monitor", 850], ["keyboard", 240], ["water bottle", 25], ["jacket", 420], ["e-reader", 390], ["standing desk", 1300]];
  for (const [i, [name, price]] of wishes.entries())
    await insert("wishlist_items", "INSERT INTO wishlist_items (user_id, name, url, estimated_price, priority, category, created_at) VALUES ($1, $2, NULL, $3, $4, $5, now() - make_interval(mins => $6::int))", [userId, `TEST ${name}`, price, price < 250 ? "low" : price < 750 ? "medium" : "high", i % 2 ? "test two" : "test", i]);

  // Gym: a workout on each of the past days that has a training day in the routine (open Gym once so the routine exists).
  const { rows: split } = await db.query(
    `SELECT d.id, d.day_of_week, (SELECT x.exercise_id FROM workout_split_day_exercises x WHERE x.split_day_id = d.id ORDER BY x.order_index LIMIT 1) AS exercise
       FROM workout_split_days d WHERE d.user_id = $1 AND NOT d.is_rest`,
    [userId],
  );
  let sessions = 0;
  for (const n of OFFSETS.filter((o) => o < 0)) {
    const day = addDays(today, n);
    const d = split.find((s) => s.day_of_week === new Date(`${day}T00:00:00Z`).getUTCDay() && s.exercise);
    if (!d) continue;
    const { rows: taken } = await db.query("SELECT 1 FROM workout_sessions WHERE user_id = $1 AND date = $2 LIMIT 1", [userId, day]);
    if (taken.length) continue;
    const id = await insert("workout_sessions", "INSERT INTO workout_sessions (user_id, split_day_id, date, duration_minutes, created_at) VALUES ($1, $2, $3, 55, $3::date + time '18:00')", [userId, d.id, day]);
    for (const set of [1, 2, 3])
      await db.query("INSERT INTO workout_sets (session_id, user_id, exercise_id, set_order, reps, load_type, load_value, extra_kg, created_at) VALUES ($1, $2, $3, $4, $5, 'kg', $6, 0, $7::date + time '18:30')", [id, userId, d.exercise, set, 12 - set * 2, 30 + Math.round((PAST + n) / 6) * 2.5, day]);
    sessions++;
  }
  console.log(`added: ${TABLES.map((t) => `${t} ${rec[t].length}`).join(", ")}, ${rec.stats.length} day totals, ${rec.categories.length} categories${sessions ? "" : " (no Gym workouts: open Gym once first)"}`);
  return rec;
}

async function main() {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query("SELECT id FROM users WHERE issuer = $1 AND subject = $2", [issuer, subject]);
    if (rows.length !== 1) throw new Error("No such user: sign in to the app once with that account first.");
    console.log(`target: ${new URL(url).hostname}${dryRun ? " (dry run, nothing is written)" : ""}`);
    const rec = remove ? await removeAll(db, rows[0].id) : await addAll(db, rows[0].id);
    await db.query(dryRun ? "ROLLBACK" : "COMMIT");
    // The record is written only after the commit, so a failed run leaves no file claiming rows that are not there.
    if (!dryRun) {
      if (remove) fs.renameSync(idsFile, `${idsFile}.removed`);
      else fs.writeFileSync(idsFile, JSON.stringify(rec));
    }
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
