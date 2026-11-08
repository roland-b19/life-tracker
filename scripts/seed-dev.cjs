/* eslint-disable @typescript-eslint/no-require-imports */
// Fills a local dev user with sample weigh-ins, water, steps and tasks, so the charts and lists have data.
// Usage: npm run seed:dev [-- <dev user name>]   (default user: "demo"; sign in with that name)
// Only runs against a local database with dev sign-in on, and only fills what that user has none of yet.
const { Client } = require("pg");

const name = process.argv[2] || "demo";
const url = process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL || "";

if (process.env.NODE_ENV === "production" || process.env.AUTH_DEV !== "true") {
  throw new Error("seed-dev runs only in development with AUTH_DEV=true.");
}
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) {
  throw new Error("seed-dev runs only against a local database.");
}

// Local calendar day, like the app's toISODate; day math in UTC so DST never skips a day.
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (iso) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = Monday, as the app

// Same numbers on every run.
let state = 42;
const random = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const between = (lo, hi) => lo + random() * (hi - lo);

async function isEmpty(db, table, userId) {
  const { rows } = await db.query(`SELECT 1 FROM ${table} WHERE user_id = $1 LIMIT 1`, [userId]);
  return rows.length === 0;
}

async function seedWeight(db, userId) {
  if (!(await isEmpty(db, "weight_entries", userId))) return "weight: skipped, the user has weigh-ins";
  let count = 0;
  for (let i = 90; i >= 0; i--) {
    if (i > 0 && random() < 0.2) continue; // some mornings without a weigh-in
    const kg = 88 - (90 - i) * 0.06 + between(-0.6, 0.6); // about -0.4 kg/week
    await db.query("INSERT INTO weight_entries (user_id, date, kilograms) VALUES ($1, $2, $3)", [
      userId,
      addDays(today, -i),
      kg.toFixed(2),
    ]);
    count++;
  }
  return `weight: ${count} weigh-ins`;
}

async function seedWaterAndSteps(db, userId) {
  if (!(await isEmpty(db, "daily_metrics", userId))) return "water and steps: skipped, the user has some";
  let count = 0;
  for (let i = 90; i >= 0; i--) {
    if (i > 0 && random() < 0.1) continue;
    const water = i === 0 ? 1250 : Math.round(between(1500, 3600) / 50) * 50;
    const steps = i === 0 ? 4321 : Math.round(between(3000, 15000));
    await db.query("INSERT INTO daily_metrics (user_id, date, water_ml, steps) VALUES ($1, $2, $3, $4)", [
      userId,
      addDays(today, -i),
      water,
      steps,
    ]);
    count++;
  }
  return `water and steps: ${count} days`;
}

const HABITS = {
  personal: [
    { title: "Read 20 pages", pattern: "daily", odds: 0.7 },
    { title: "Stretch 10 minutes", pattern: "daily", odds: 0.55 },
    { title: "Gym", pattern: "days:1,3,5", odds: 0.85 },
  ],
  business: [
    { title: "Inbox zero", pattern: "daily", odds: 0.6 },
    { title: "Weekly review", pattern: "days:5", odds: 0.9 },
  ],
};
const ONE_OFFS = {
  personal: ["Pay rent", "Call mom", "Buy groceries", "Clean the kitchen", "Book dentist", "Return the package", "Plan the weekend"],
  business: ["Send invoice", "Reply to client", "Prepare the slides", "Update the roadmap", "Review the contract"],
};
const HISTORY_DAYS = 45;

async function seedTasks(db, userId) {
  if (!(await isEmpty(db, "todos", userId))) return "tasks: skipped, the user has tasks";
  const start = addDays(today, -HISTORY_DAYS);
  // Created on its first day, so the app treats it like a task added back then.
  const insert = (space, title, recurring, pattern, due, done) =>
    db
      .query(
        `INSERT INTO todos (user_id, space, title, is_recurring, recurrence_pattern, due_date, is_completed, completed_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 THEN ($6::date + time '18:00') END, $6::date + time '08:00')
         RETURNING id`,
        [userId, space, title, recurring, pattern, due, done],
      )
      .then((r) => r.rows[0].id);

  let count = 0;
  for (const space of ["personal", "business"]) {
    const stats = new Map(); // "day|recurring" -> { total, done }
    const tally = (day, recurring, done) => {
      const key = `${day}|${recurring}`;
      const s = stats.get(key) ?? { total: 0, done: 0 };
      s.total++;
      if (done) s.done++;
      stats.set(key, s);
    };

    for (const habit of HABITS[space]) {
      const id = await insert(space, habit.title, true, habit.pattern, start, false);
      count++;
      for (let day = start; day <= today; day = addDays(day, 1)) {
        const due = habit.pattern === "daily" || habit.pattern.slice(5).split(",").includes(String(weekday(day)));
        if (!due) continue;
        const done = day < today && random() < habit.odds;
        if (done) await db.query("INSERT INTO todo_completions (todo_id, date) VALUES ($1, $2)", [id, day]);
        if (day < today) tally(day, true, done);
      }
    }

    // One to three one-off tasks a day: past ones done, yesterday's last one left open so it carries over today.
    const titles = ONE_OFFS[space];
    let t = 0;
    for (let i = HISTORY_DAYS; i >= -4; i--) {
      const day = addDays(today, -i);
      const n = i === 0 ? 3 : Math.floor(between(1, 3.99));
      for (let k = 0; k < n; k++) {
        const done = i > 1 || (i === 1 && k < n - 1) || (i === 0 && k === 0);
        await insert(space, titles[t++ % titles.length], false, "none", day, done);
        count++;
        if (i > 0) tally(day, false, done);
      }
    }

    // The frozen per-day totals the Progress chart reads.
    for (const [key, s] of stats) {
      const [day, recurring] = key.split("|");
      await db.query(
        `INSERT INTO todo_day_stats (user_id, space, is_recurring, date, total, done) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, space, is_recurring, date) DO UPDATE SET total = EXCLUDED.total, done = EXCLUDED.done`,
        [userId, space, recurring === "true", day, s.total, s.done],
      );
    }
  }
  return `tasks: ${count}`;
}

async function main() {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("BEGIN");
    // The same row dev sign-in creates for this name.
    const { rows } = await db.query(
      `INSERT INTO users (issuer, subject) VALUES ('dev', $1)
       ON CONFLICT (issuer, subject) DO UPDATE SET subject = EXCLUDED.subject RETURNING id`,
      [name],
    );
    const userId = rows[0].id;
    const done = [await seedWeight(db, userId), await seedWaterAndSteps(db, userId), await seedTasks(db, userId)];
    await db.query("COMMIT");
    console.log(`Seeded dev user "${name}" (today ${today}):\n  ${done.join("\n  ")}`);
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
