/* eslint-disable @typescript-eslint/no-require-imports */
// Stress-test data for the LOCAL dev database only: extreme names (120-char, emoji, RTL, quotes, HTML-looking text), many categories,
// hundreds of rows, month/year/leap-day edges. Usage: AUTH_DEV=true DATABASE_URL_MIGRATE=<local url> node scripts/seed-stress.cjs [user] [empty]
// Users: "stress" (default) gets everything; pass "empty" as the user name for a user with nothing but the sign-in row.
// Refuses anything but a local database with AUTH_DEV=true. Re-running adds nothing if the user already has wishlist rows.
const { Client } = require("pg");

const name = process.argv[2] || "stress";
const url = process.env.DATABASE_URL_MIGRATE || "";
if (process.env.NODE_ENV === "production" || process.env.AUTH_DEV !== "true") throw new Error("seed-stress runs only with AUTH_DEV=true.");
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("seed-stress runs only against a local database.");

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const long120 = "L".repeat(60) + " " + "ö".repeat(59);
const weird = ["🍕 Pizza 🍕", "العربية שלום", "O'Brien \"quoted\" & <b>bold</b>", "日本語のとても長い名前".repeat(8), "a", "  inner   spaces  ", "x".repeat(120), "Ünïcödé — dash"];

(async () => {
  const db = new Client({ connectionString: url });
  await db.connect();
  const { rows: [{ id: userId }] } = await db.query(
    `INSERT INTO users (issuer, subject) VALUES ('dev', $1) ON CONFLICT (issuer, subject) DO UPDATE SET subject = EXCLUDED.subject RETURNING id`,
    [name],
  );
  const { rows: seeded } = await db.query("SELECT 1 FROM wishlist_items WHERE user_id = $1 LIMIT 1", [userId]);
  if (name === "empty" || seeded.length) {
    console.log(name === "empty" ? 'User "empty" has no data on purpose.' : `"${name}" already has data; nothing added.`);
    return void (await db.end());
  }

  // Wishlist: 400 items over 40 categories, every price edge (0.01 ... 9,999,999.99), weird names.
  await db.query(
    `INSERT INTO item_categories (user_id, scope, name, sort_order) SELECT $1, 'wishlist', 'cat-' || g, g FROM generate_series(1, 40) g ON CONFLICT DO NOTHING`,
    [userId],
  );
  await db.query(
    `INSERT INTO wishlist_items (user_id, name, url, estimated_price, priority, category, created_at)
     SELECT $1, 'Item ' || g || ' ' || repeat('w', (g % 100)), CASE WHEN g % 3 = 0 THEN 'https://example.com/' || g ELSE NULL END,
            p, CASE WHEN p < 250 THEN 'low' WHEN p < 750 THEN 'medium' ELSE 'high' END, 'cat-' || (g % 40 + 1), now() - (g || ' minutes')::interval
     FROM (SELECT g, CASE g % 8 WHEN 0 THEN 0.01 WHEN 1 THEN 249.99 WHEN 2 THEN 250 WHEN 3 THEN 749.99 WHEN 4 THEN 750 WHEN 5 THEN 9999999.99 ELSE round((random() * 3000)::numeric, 2) END AS p FROM generate_series(1, 400) g) s`,
    [userId],
  );
  for (const [i, w] of weird.entries()) {
    await db.query(
      `INSERT INTO wishlist_items (user_id, name, estimated_price, priority, category) VALUES ($1, $2, $3, 'low', 'other')`,
      [userId, w.slice(0, 120), 10 + i],
    );
  }

  // Shopping: 12 sections incl. a 50-char one, 300 items, weird units and long names.
  await db.query(
    `INSERT INTO shopping_categories (user_id, name, sort_order) SELECT $1, CASE WHEN g = 12 THEN repeat('s', 50) ELSE 'sec-' || g END, g FROM generate_series(1, 12) g ON CONFLICT DO NOTHING`,
    [userId],
  );
  await db.query(
    `INSERT INTO shopping_items (user_id, name, amount, unit, category, is_bought, created_at)
     SELECT $1, 'Thing ' || g || ' ' || repeat('s', g % 90), CASE WHEN g % 5 = 0 THEN 0.01 WHEN g % 7 = 0 THEN 1000 ELSE (g % 9) + 1 END, CASE WHEN g % 4 = 0 THEN repeat('u', 30) ELSE 'pcs' END,
            CASE WHEN g % 12 = 0 THEN repeat('s', 50) ELSE 'sec-' || (g % 11 + 1) END, g % 3 = 0, now() - (g || ' minutes')::interval
     FROM generate_series(1, 300) g`,
    [userId],
  );

  // Meals: 3 years of daily meals incl. a leap day, 0-kcal and 10000-kcal rows, weird names.
  await db.query(
    `INSERT INTO meals (user_id, date, name, calories, protein, carbs, fat, created_at)
     SELECT $1, d::date, CASE WHEN m = 1 THEN repeat('M', 120) WHEN m = 2 THEN '🍕 Pizza ' || m ELSE 'Meal ' || (extract(doy from d)::int % 60) || '-' || m END,
            CASE WHEN m = 3 AND extract(day from d) = 1 THEN 10000 WHEN m = 4 AND extract(day from d) = 2 THEN 0 ELSE 300 + (extract(doy from d)::int % 400) END,
            20, 40, 10, d::timestamptz + (m || ' hours')::interval
     FROM generate_series(($2::date - 1100), $2::date, '1 day') d, generate_series(1, 4) m`,
    [userId, today],
  );
  await db.query(`INSERT INTO meals (user_id, date, name, calories, protein, carbs, fat) VALUES ($1, '2024-02-29', 'Leap day cake', 500, 5, 60, 20)`, [userId]);

  // Weight: yearly span, two decimals, the 20 and 500 kg limits, a gap of 40 days.
  await db.query(
    `INSERT INTO weight_entries (user_id, date, kilograms) SELECT $1, d::date, round((70 + 8 * sin(extract(doy from d) / 20.0))::numeric, 2)
     FROM generate_series(($2::date - 400), ($2::date - 40), '1 day') d WHERE extract(dow from d) <> 3 ON CONFLICT DO NOTHING`,
    [userId, today],
  );
  await db.query(`INSERT INTO weight_entries (user_id, date, kilograms) VALUES ($1, $2, 20.00), ($1, $3, 500.00) ON CONFLICT DO NOTHING`, [userId, addDays(today, -41), addDays(today, -42)]);
  await db.query(
    `INSERT INTO daily_metrics (user_id, date, water_ml, steps) SELECT $1, d::date, (g % 7) * 500, (g % 11) * 1500 FROM generate_series(($2::date - 200), $2::date, '1 day') WITH ORDINALITY t(d, g) ON CONFLICT DO NOTHING`,
    [userId, today],
  );

  // Tasks: both spaces, 30 categories, repeating tasks, a 150-char title, weird titles.
  await db.query(
    `INSERT INTO item_categories (user_id, scope, name, sort_order) SELECT $1, sc, 'tcat-' || g, g FROM generate_series(1, 30) g, unnest(ARRAY['personal','business']) sc ON CONFLICT DO NOTHING`,
    [userId],
  );
  await db.query(
    `INSERT INTO todos (user_id, space, title, is_recurring, recurrence_pattern, due_date, is_completed, category, created_at)
     SELECT $1, CASE WHEN g % 2 = 0 THEN 'personal' ELSE 'business' END, CASE WHEN g % 50 = 0 THEN repeat('T', 150) ELSE 'Task ' || g END,
            g % 4 = 0, CASE WHEN g % 4 = 0 THEN 'daily' ELSE 'none' END, ($2::date + ((g % 9) - 4)), g % 3 = 0, 'tcat-' || (g % 30 + 1),
            now() - (g || ' minutes')::interval
     FROM generate_series(1, 300) g`,
    [userId, today],
  );
  for (const [i, w] of weird.entries()) {
    await db.query(
      `INSERT INTO todos (user_id, space, title, due_date, category) VALUES ($1, 'personal', $2, $3, 'other')`,
      [userId, w.slice(0, 150) + " #" + i, today],
    );
  }
  console.log(`Seeded stress user "${name}" (today ${today}). Long name sample: ${long120.length} chars.`);
  await db.end();
})();
