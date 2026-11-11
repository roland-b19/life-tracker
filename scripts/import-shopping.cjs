/* eslint-disable @typescript-eslint/no-require-imports */
// Replaces one person's whole shopping list (items, history and categories) with the ones in a local JSON file.
// The data never lives in git: the default file `.local/shopping-list.json` is gitignored. It is {"category": ["item", ...]},
// in the order the categories should be walked. Names are kept as written; category names are lower-cased as the app does.
// Usage: DATABASE_URL_MIGRATE=<owner url> node scripts/import-shopping.cjs [--dry-run] [--file <path>] [--subject <github id>]
// DESTRUCTIVE for that user's shopping list only: everything on it now is deleted first. Nothing else is touched.
const fs = require("node:fs");
const { Client } = require("pg");

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const dryRun = args.includes("--dry-run");
const file = option("--file", ".local/shopping-list.json");
const issuer = option("--issuer", "https://github.com");
const subject = option("--subject", process.env.IMPORT_SUBJECT || "");
const url = process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL || "";

if (!subject) throw new Error("Pass --subject <your GitHub numeric id> (or set IMPORT_SUBJECT).");
if (!url) throw new Error("Set DATABASE_URL_MIGRATE to the owner connection string.");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

async function main() {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query("SELECT id FROM users WHERE issuer = $1 AND subject = $2", [issuer, subject]);
    if (rows.length !== 1) throw new Error("No such user: sign in to the app once with that account first.");
    const userId = rows[0].id;
    console.log(`target: ${new URL(url).hostname}${dryRun ? " (dry run, nothing is written)" : ""}`);

    const gone = await db.query("DELETE FROM shopping_items WHERE user_id = $1", [userId]);
    const goneCategories = await db.query("DELETE FROM shopping_categories WHERE user_id = $1", [userId]);
    console.log(`deleted: ${gone.rowCount} items, ${goneCategories.rowCount} categories`);

    let items = 0;
    for (const [order, [label, names]] of Object.entries(data).entries()) {
      const category = label.trim().toLowerCase();
      if (!category || category === "other" || category.length > 50) throw new Error(`Bad category: ${label}`);
      await db.query("INSERT INTO shopping_categories (user_id, name, sort_order) VALUES ($1, $2, $3)", [userId, category, order + 1]);
      for (const name of new Set(names.map((n) => n.trim()))) {
        if (!name || name.length > 120) throw new Error(`Bad item: ${name}`);
        await db.query("INSERT INTO shopping_items (user_id, name, category) VALUES ($1, $2, $3)", [userId, name, category]);
        items++;
      }
    }
    console.log(`added: ${items} items in ${Object.keys(data).length} categories`);
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
