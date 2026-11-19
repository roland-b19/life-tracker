/* eslint-disable @typescript-eslint/no-require-imports */
// Fills local dev users with sample weigh-ins, water, steps, meals, a shopping list, tasks (some habits already ticked today,
// a few with a reminder), a wishlist, custom exercises and 8 weeks of workouts with a deload week, so every page has data.
// Usage: npm run seed:dev [-- <dev user name> ...]   (default user: "demo"; sign in with that name)
// Only runs against a local database with dev sign-in on. Weight, water and steps fill only the days
// that have no entry; meals, shopping and tasks only fill when the user has none yet; workouts fill only the training days
// without a session (the user must have opened Gym once, which creates the split). Nothing is overwritten.
const { Client } = require("pg");

const names = process.argv.slice(2).length ? process.argv.slice(2) : ["demo"];
// SEED_DAYS=730 gives about two years of history (for the cost-guard measurements); the default keeps the sample small.
const DAYS = Number(process.env.SEED_DAYS) || 90;
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
  for (let i = DAYS; i >= 0; i--) {
    if (i > 0 && random() < 0.2) continue; // some mornings without a weigh-in
    const kg = 88 - (DAYS - i) * 0.06 + between(-0.6, 0.6); // about -0.4 kg/week
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
  for (let i = DAYS; i >= 0; i--) {
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
  for (let i = DAYS > 90 ? DAYS : 30; i >= 0; i--) {
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
    { title: "Read 20 pages", pattern: "daily", odds: 0.7, category: "mind" },
    { title: "Meditate 5 minutes", pattern: "daily", odds: 0.5, category: "mind" },
    { title: "Stretch 10 minutes", pattern: "daily", odds: 0.55, category: "health" },
    { title: "Gym", pattern: "days:1,3,5", odds: 0.85, category: "health" },
    { title: "Water the plants", pattern: "days:2,6", odds: 0.8 },
  ],
  business: [
    { title: "Inbox zero", pattern: "daily", odds: 0.6, category: "admin" },
    { title: "Weekly review", pattern: "days:5", odds: 0.9, category: "admin" },
    { title: "Learn something new", pattern: "daily", odds: 0.5, category: "growth" },
  ],
};
// Task categories per space, in order; a habit without one lands in Other.
const TASK_CATEGORIES = { personal: ["health", "mind"], business: ["admin", "growth"] };
const ONE_OFFS = {
  personal: ["Pay rent", "Call mom", "Buy groceries", "Clean the kitchen", "Book dentist", "Return the package", "Plan the weekend"],
  business: ["Send invoice", "Reply to client", "Prepare the slides", "Update the roadmap", "Review the contract"],
};
const HISTORY_DAYS = DAYS > 90 ? DAYS : 45;

async function seedTasks(db, userId) {
  if (!(await isEmpty(db, "todos", userId))) return "tasks: skipped, the user has tasks";
  const start = addDays(today, -HISTORY_DAYS);
  // Created on its first day, so the app treats it like a task added back then.
  const insert = (space, title, recurring, pattern, due, done, category = "other") =>
    db
      .query(
        `INSERT INTO todos (user_id, space, title, is_recurring, recurrence_pattern, due_date, is_completed, completed_at, created_at, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 THEN ($6::date + time '18:00') END, $6::date + time '08:00', $8)
         RETURNING id`,
        [userId, space, title, recurring, pattern, due, done, category],
      )
      .then((r) => r.rows[0].id);

  let count = 0;
  for (const space of ["personal", "business"]) {
    for (const [i, c] of TASK_CATEGORIES[space].entries())
      await db.query(`INSERT INTO item_categories (user_id, scope, name, sort_order) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [userId, space, c, i + 1]);
    // A habit due today is already ticked by its odds, so the Daily tab shows both done and open ones.
    for (const habit of HABITS[space]) {
      const id = await insert(space, habit.title, true, habit.pattern, start, false, habit.category);
      const dueToday = habit.pattern === "daily" || habit.pattern.slice(5).split(",").includes(String(weekday(today)));
      if (dueToday && random() < habit.odds) await db.query("UPDATE todos SET is_completed = true, completed_at = now() WHERE id = $1", [id]);
      count++;
    }

    // One to three one-off tasks a day: past ones done, yesterday's last one left open so it carries over today.
    const titles = ONE_OFFS[space];
    let t = 0;
    for (let i = HISTORY_DAYS; i >= -4; i--) {
      const day = addDays(today, -i);
      const n = i === 0 ? 3 : Math.floor(between(1, 3.99));
      for (let k = 0; k < n; k++) {
        const done = i > 1 || (i === 1 && k < n - 1) || (i === 0 && k === 0);
        const id = await insert(space, titles[t++ % titles.length], false, "none", day, done);
        // Today's and the coming days' last task has a reminder.
        if (i <= 0 && k === n - 1) await db.query("UPDATE todos SET reminder_time = $2 WHERE id = $1", [id, i === 0 ? "18:00" : "09:00"]);
        count++;
      }
    }
  }
  return `tasks: ${count}`;
}

// Tuesday 10.11.2026 as a fixed test day: daily tasks plus a done and an open one-off. Runs once per user; the title prefix marks its rows.
const FIXTURE_DAY = "2026-11-10";
async function seedFixtureDay(db, userId) {
  const { rows } = await db.query("SELECT 1 FROM todos WHERE user_id = $1 AND title LIKE 'Tue 10.11 %' LIMIT 1", [userId]);
  if (rows.length) return "fixture day: skipped, already there";
  const add = async (title, recurring, due, { done = false, category = "other" } = {}) => {
    await db.query(
      `INSERT INTO todos (user_id, space, title, is_recurring, recurrence_pattern, due_date, is_completed, completed_at, created_at, category)
       VALUES ($1, 'personal', $2, $3, $4, $5, $6, CASE WHEN $6 THEN $5::date + time '18:00' END, $5::date + time '08:00', $7) RETURNING id`,
      [userId, title, recurring, recurring ? "daily" : "none", due, done, category],
    );
  };
  await add("Tue 10.11 daily, health", true, "2026-11-03", { category: "health" });
  await add("Tue 10.11 daily, mind", true, "2026-11-03", { category: "mind" });
  await add("Tue 10.11 one-off, done", false, FIXTURE_DAY, { done: true });
  await add("Tue 10.11 one-off, open", false, FIXTURE_DAY);
  return `fixture day: 4 tasks on ${FIXTURE_DAY}`;
}

// [name, link, price]; the priority follows the price (under 250 low, under 750 medium, else high). Links cover https, a bare domain and free text.
const WISHLIST = [
  ["Standing desk", "https://www.ikea.com/ro/ro/", 1450],
  ["Mechanical keyboard", "emag.ro", 480],
  ["Noise-cancelling headphones", "https://example.com/headphones", 1100],
  ["Running shoes", "Decathlon", 320],
  ["Desk lamp", null, 89.9],
  ["Yoga mat", "decathlon.ro", 119],
  ["Espresso machine", null, 899],
  ["Water bottle", "emag", 45],
];

// Wishlist categories, in order; the seed files each item under one of them (or Other).
const WISHLIST_CATEGORIES = ["home", "tech", "sport", "kitchen"];
const WISHLIST_CATEGORY = { "Standing desk": "home", "Mechanical keyboard": "tech", "Noise-cancelling headphones": "tech", "Running shoes": "sport", "Desk lamp": "home", "Yoga mat": "sport", "Espresso machine": "kitchen" };

async function seedWishlist(db, userId) {
  if (!(await isEmpty(db, "wishlist_items", userId))) return "wishlist: skipped, the user has items";
  for (const [i, c] of WISHLIST_CATEGORIES.entries())
    await db.query(`INSERT INTO item_categories (user_id, scope, name, sort_order) VALUES ($1, 'wishlist', $2, $3) ON CONFLICT DO NOTHING`, [userId, c, i + 1]);
  for (const [i, [itemName, link, price]] of WISHLIST.entries()) {
    const priority = price >= 750 ? "high" : price >= 250 ? "medium" : "low";
    await db.query(
      `INSERT INTO wishlist_items (user_id, name, url, estimated_price, priority, category, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() - make_interval(days => $7))`,
      [userId, itemName, link, price, priority, WISHLIST_CATEGORY[itemName] ?? "other", i * 3],
    );
  }
  return `wishlist: ${WISHLIST.length} items`;
}

// [name, muscle group, equipment]: the user's own exercises, beside the shared defaults.
const CUSTOM_EXERCISES = [
  ["Landmine press", "shoulders", "barbell"],
  ["Single-arm cable row", "back", "cable"],
  ["Nordic curl", "hamstrings", "bodyweight"],
];

async function seedCustomExercises(db, userId) {
  let count = 0;
  for (const [exerciseName, muscle, equipment] of CUSTOM_EXERCISES) {
    const { rowCount } = await db.query(
      `INSERT INTO exercises (user_id, name, muscle_group, equipment_type, is_custom) VALUES ($1, $2, $3, $4, true) ON CONFLICT DO NOTHING`,
      [userId, exerciseName, muscle, equipment],
    );
    count += rowCount;
  }
  return `custom exercises: ${count} added`;
}

// The Sunday that starts the date's week, as the app's deload weeks and Progress tab count them.
const sunday = (iso) => addDays(iso, -new Date(`${iso}T00:00:00Z`).getUTCDay());

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
  const WEEKS = DAYS > 90 ? Math.floor(DAYS / 7) : 8;
  const first = sunday(addDays(today, -WEEKS * 7));
  for (let i = WEEKS * 7; i >= 1; i--) {
    const date = addDays(today, -i);
    const day = byWeekday.get(new Date(`${date}T00:00:00Z`).getUTCDay());
    if (!day || random() < 0.1) continue; // a skipped workout now and then
    const taken = await db.query("SELECT 1 FROM workout_sessions WHERE user_id = $1 AND date = $2 LIMIT 1", [userId, date]);
    if (taken.rowCount) continue;
    const week = Math.round((new Date(`${sunday(date)}T00:00:00Z`) - new Date(`${first}T00:00:00Z`)) / 864e5 / 7);
    const deload = week % 8 === 4; // one calendar week in every eight is a deload week, marked as the user would
    if (deload) await db.query("INSERT INTO deload_weeks (user_id, week_start) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, sunday(date)]);
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
        // Now and then a set short of failure or with a partial rep, so the set flags show up too.
        await db.query(
          `INSERT INTO workout_sets (session_id, user_id, exercise_id, set_order, reps, load_type, load_value, extra_kg, is_failure, is_partial, created_at)
           VALUES ($1, $2, $3, $4, $5, 'kg', $6, 0, $7, $8, $9)`,
          [rows[0].id, userId, day.exercises[e], set, reps, load.toFixed(2), random() > 0.15, random() < 0.08, `${date}T18:${pad(e * 2 + set)}:00Z`],
        );
      }
    }
    sessions++;
  }
  return `gym: ${sessions} workouts added (${WEEKS} weeks, a deload week in every eight)`;
}

async function main() {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    for (const name of names) await seedUser(db, name);
  } finally {
    await db.end();
  }
}

async function seedUser(db, name) {
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
      await seedFixtureDay(db, userId),
      await seedWishlist(db, userId),
      await seedCustomExercises(db, userId),
      await seedGym(db, userId),
    ];
    await db.query("COMMIT");
    console.log(`Seeded dev user "${name}" (today ${today}):\n  ${done.join("\n  ")}`);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
