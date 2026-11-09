/* eslint-disable @typescript-eslint/no-require-imports */
// Fills a local dev user with sample weigh-ins, water, steps, meals, a shopping list, tasks and 8 weeks of workouts, so every Health tab, Tasks and Gym Progress have data.
// Usage: npm run seed:dev [-- <dev user name>]   (default user: "demo"; sign in with that name)
// Only runs against a local database with dev sign-in on. Weight, water and steps fill only the days
// that have no entry; meals, shopping and tasks only fill when the user has none yet; workouts fill only the training days
// without a session (the user must have opened Gym once, which creates the split). Nothing is overwritten.
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
  let count = 0;
  for (let i = 90; i >= 0; i--) {
    if (i > 0 && random() < 0.2) continue; // some mornings without a weigh-in
    const kg = 88 - (90 - i) * 0.06 + between(-0.6, 0.6); // about -0.4 kg/week
    const { rowCount } = await db.query(
      "INSERT INTO weight_entries (user_id, date, kilograms) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [userId, addDays(today, -i), kg.toFixed(2)],
    );
    count += rowCount;
  }
  return `weight: ${count} weigh-ins added`;
}

async function seedWaterAndSteps(db, userId) {
  let count = 0;
  for (let i = 90; i >= 0; i--) {
    if (i > 0 && random() < 0.1) continue;
    const water = i === 0 ? 1250 : Math.round(between(1500, 3600) / 50) * 50;
    const steps = i === 0 ? 4321 : Math.round(between(3000, 15000));
    const { rowCount } = await db.query(
      "INSERT INTO daily_metrics (user_id, date, water_ml, steps) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      [userId, addDays(today, -i), water, steps],
    );
    count += rowCount;
  }
  return `water and steps: ${count} days added`;
}

// [name, kcal, protein, carbs, fat] per slot; the Past foods sheet is built from these.
const MEALS = {
  breakfast: [["Oatmeal with banana", 420, 14, 72, 8], ["Scrambled eggs and toast", 480, 28, 35, 24], ["Greek yogurt bowl", 380, 35, 45, 4]],
  lunch: [["Chicken and rice", 620, 55, 75, 10], ["Beef and sweet potato", 680, 50, 65, 22], ["Tuna salad", 450, 40, 20, 22]],
  snack: [["Protein shake", 240, 40, 8, 4], ["Apple and peanut butter", 290, 8, 30, 16], ["Rice cakes", 140, 3, 29, 1]],
  dinner: [["Salmon with potatoes", 650, 42, 50, 28], ["Pasta bolognese", 720, 38, 85, 22], ["Turkey wrap", 520, 38, 48, 18]],
};
const MEAL_TIME = { breakfast: "08:00", lunch: "13:00", snack: "16:30", dinner: "19:30" };

async function seedMeals(db, userId) {
  if (!(await isEmpty(db, "meals", userId))) return "meals: skipped, the user has meals";
  let count = 0;
  for (let i = 30; i >= 0; i--) {
    const day = addDays(today, -i);
    // Today has breakfast and lunch only, so the Nutrition bars are part way.
    const slots = i === 0 ? ["breakfast", "lunch"] : Object.keys(MEALS).filter((slot) => slot !== "snack" || random() < 0.6);
    for (const slot of slots) {
      const [mealName, kcal, protein, carbs, fat] = MEALS[slot][Math.floor(random() * MEALS[slot].length)];
      await db.query(
        `INSERT INTO meals (user_id, date, name, calories, protein, carbs, fat, is_estimated, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $2::date + $9::time)`,
        [userId, day, mealName, kcal, protein, carbs, fat, random() < 0.15, MEAL_TIME[slot]],
      );
      count++;
    }
  }
  return `meals: ${count}`;
}

// [name, amount, unit, category, state]: "list" to buy, "bought" ticked, "cleared" taken off the list.
const SHOPPING = [
  ["Chicken breast", 1, "kg", "meat", "list"],
  ["Bananas", 6, "pcs", "produce", "list"],
  ["Spinach", 200, "g", "produce", "list"],
  ["Milk", 2, "l", "dairy", "list"],
  ["Greek yogurt", 3, "pcs", "dairy", "bought"],
  ["Sourdough bread", 1, "pcs", "bakery", "bought"],
  ["Rolled oats", 1, "kg", "pantry", "list"],
  ["Basmati rice", 2, "kg", "pantry", "list"],
  ["Frozen berries", 500, "g", "frozen", "list"],
  ["Dish soap", 1, "pcs", "other", "list"],
  ["Eggs", 10, "pcs", "dairy", "cleared"],
  ["Salmon fillet", 400, "g", "meat", "cleared"],
  ["Tomatoes", 6, "pcs", "produce", "cleared"],
  ["Peanut butter", 1, "pcs", "pantry", "cleared"],
  ["Tortillas", 1, "pcs", "bakery", "cleared"],
];

async function seedShopping(db, userId) {
  if (!(await isEmpty(db, "shopping_items", userId))) return "shopping: skipped, the user has items";
  // The app's default sections plus one of the user's own; existing ones keep their order.
  const sections = ["meat", "produce", "dairy", "bakery", "pantry", "frozen"];
  for (const [i, section] of sections.entries()) {
    await db.query(
      "INSERT INTO shopping_categories (user_id, name, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [userId, section, i + 1],
    );
  }
  for (const [i, [itemName, amount, unit, category, itemState]] of SHOPPING.entries()) {
    const cleared = itemState === "cleared";
    await db.query(
      `INSERT INTO shopping_items (user_id, name, amount, unit, category, is_bought, created_at, cleared_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() - make_interval(days => $7), CASE WHEN $8 THEN now() - interval '2 days' END)`,
      [userId, itemName, amount, unit, category, itemState !== "list", cleared ? 9 + i : i % 3, cleared],
    );
  }
  return `shopping: ${SHOPPING.length} items, ${sections.length} sections`;
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

async function seedGym(db, userId) {
  const { rows: days } = await db.query(
    `SELECT d.id, d.day_of_week, array_agg(x.exercise_id ORDER BY x.order_index) AS exercises,
            array_agg(x.min_reps ORDER BY x.order_index) AS mins, array_agg(x.max_reps ORDER BY x.order_index) AS maxs
       FROM workout_split_days d JOIN workout_split_day_exercises x ON x.split_day_id = d.id
      WHERE d.user_id = $1 AND NOT d.is_rest GROUP BY d.id`,
    [userId],
  );
  if (!days.length) return "gym: skipped (open the Gym page once so the routine exists)";
  const byWeekday = new Map(days.map((d) => [d.day_of_week, d]));
  let sessions = 0;
  for (let i = 56; i >= 1; i--) {
    const date = addDays(today, -i);
    const day = byWeekday.get(new Date(`${date}T00:00:00Z`).getUTCDay());
    if (!day || random() < 0.1) continue; // a skipped workout now and then
    const taken = await db.query("SELECT 1 FROM workout_sessions WHERE user_id = $1 AND date = $2 LIMIT 1", [userId, date]);
    if (taken.rowCount) continue;
    const week = Math.floor((56 - i) / 7); // 0..7
    const deload = week === 4;
    const { rows } = await db.query(
      `INSERT INTO workout_sessions (user_id, split_day_id, date, duration_minutes, is_deload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, day.id, date, Math.round(between(45, 75)), deload, `${date}T18:00:00Z`],
    );
    for (let e = 0; e < day.exercises.length; e++) {
      // A stable starting load per exercise, +2.5 kg every two weeks (a deload week lifts about 60%).
      const hash = [...day.exercises[e]].reduce((a, c) => a + c.charCodeAt(0), 0);
      const base = 20 + (hash % 13) * 5;
      const load = (base + Math.floor(week / 2) * 2.5) * (deload ? 0.6 : 1);
      for (let set = 1; set <= 2; set++) {
        const reps = Math.round(between(day.mins[e], day.maxs[e]));
        await db.query(
          `INSERT INTO workout_sets (session_id, user_id, exercise_id, set_order, reps, load_type, load_value, extra_kg, created_at)
           VALUES ($1, $2, $3, $4, $5, 'kg', $6, 0, $7)`,
          [rows[0].id, userId, day.exercises[e], set, reps, load.toFixed(2), `${date}T18:${pad(e * 2 + set)}:00Z`],
        );
      }
    }
    sessions++;
  }
  return `gym: ${sessions} workouts added (8 weeks, one deload week)`;
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
    const done = [
      await seedWeight(db, userId),
      await seedWaterAndSteps(db, userId),
      await seedMeals(db, userId),
      await seedShopping(db, userId),
      await seedTasks(db, userId),
      await seedGym(db, userId),
    ];
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
