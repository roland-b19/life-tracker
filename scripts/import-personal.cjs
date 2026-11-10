/* eslint-disable @typescript-eslint/no-require-imports */
// Loads one person's real wishlist and tasks from a local JSON file into their account. The data never lives in git:
// the default file `.local/personal-data.json` is gitignored. Gym needs no import (opening Gym creates the routine).
// Usage: DATABASE_URL_MIGRATE=<owner url> node scripts/import-personal.cjs [--dry-run] [--file <path>] [--subject <github id>]
// Idempotent: an item or task whose name already exists for the user (any case) is skipped, nothing is updated or deleted.
const fs = require("node:fs");
const { Client } = require("pg");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const dryRun = flag("--dry-run");
const file = option("--file", ".local/personal-data.json");
const issuer = option("--issuer", "https://github.com");
const subject = option("--subject", process.env.IMPORT_SUBJECT || "");
const url = process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL || "";

if (!subject) throw new Error("Pass --subject <your GitHub numeric id> (or set IMPORT_SUBJECT).");
if (!url) throw new Error("Set DATABASE_URL_MIGRATE to the owner connection string.");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

// The app's calendar day (Europe/Bucharest), as APP_TZ in src/lib/format-date.ts.
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
const priorityFor = (price) => (price < 250 ? "low" : price < 750 ? "medium" : "high");

async function main() {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query("SELECT id FROM users WHERE issuer = $1 AND subject = $2", [issuer, subject]);
    if (rows.length !== 1) throw new Error("No such user: sign in to the app once with that account first.");
    const userId = rows[0].id;
    console.log(`target: ${new URL(url).hostname}${dryRun ? " (dry run, nothing is written)" : ""}`);

    // The list shows newest first, so the first entry gets the newest created_at (one second apart; now() is constant inside a transaction).
    let added = 0;
    for (const [i, [name, price]] of data.wishlist.entries()) {
      if (name.length > 120 || !(price > 0)) throw new Error(`Bad wishlist entry: ${name}`);
      const { rowCount } = await db.query(
        `INSERT INTO wishlist_items (user_id, name, url, estimated_price, priority, created_at)
         SELECT $1::uuid, $2::varchar, NULL, $3::numeric, $4::varchar, now() - make_interval(secs => $5::int)
         WHERE NOT EXISTS (SELECT 1 FROM wishlist_items WHERE user_id = $1::uuid AND lower(name) = lower($2::varchar))`,
        [userId, name, price, priorityFor(price), i],
      );
      added += rowCount;
    }
    console.log(`wishlist: ${added} added, ${data.wishlist.length - added} already there`);

    for (const [space, groups] of Object.entries(data.tasks)) {
      for (const [kind, titles] of Object.entries(groups)) {
        const daily = kind === "daily";
        let n = 0;
        for (const [i, title] of titles.entries()) {
          if (title.length > 150) throw new Error(`Task title too long: ${title}`);
          const { rowCount } = await db.query(
            `INSERT INTO todos (user_id, space, title, is_recurring, recurrence_pattern, due_date, created_at)
             SELECT $1::uuid, $2::varchar, $3::varchar, $4::boolean, $5::varchar, $6::date, now() - make_interval(secs => $7::int)
             WHERE NOT EXISTS (SELECT 1 FROM todos WHERE user_id = $1::uuid AND space = $2::varchar AND lower(title) = lower($3::varchar) AND is_recurring = $4::boolean)`,
            [userId, space, title, daily, daily ? "daily" : "none", today, i],
          );
          n += rowCount;
        }
        console.log(`tasks ${space} ${kind}: ${n} added, ${titles.length - n} already there`);
      }
    }
    await db.query(dryRun ? "ROLLBACK" : "COMMIT");
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
