/* eslint-disable @typescript-eslint/no-require-imports */
// Deletes everything one person owns (tasks, wishlist, health, gym, shopping, Claude token, push subscriptions) and keeps
// their sign-in account, so they can sign in again and re-import. Run it yourself, from your Mac, after taking a backup.
// Usage: DATABASE_URL_MIGRATE=<owner url> node scripts/wipe-my-data.cjs --subject <github id> [--issuer <url>] [--confirm-delete-everything]
// Without --confirm-delete-everything it only counts (a dry run). Everything runs in one transaction: all or nothing.
const { Client } = require("pg");

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const confirmed = args.includes("--confirm-delete-everything");
const issuer = option("--issuer", "https://github.com");
const subject = option("--subject", "");
const url = process.env.DATABASE_URL_MIGRATE || "";

if (!subject) throw new Error("Pass --subject <your GitHub numeric id>.");
if (!url) throw new Error("Set DATABASE_URL_MIGRATE to the owner connection string.");

async function main() {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query("SELECT id FROM users WHERE issuer = $1 AND subject = $2", [issuer, subject]);
    if (rows.length !== 1) throw new Error("No such user.");
    const userId = rows[0].id;
    console.log(`target: ${new URL(url).hostname}${confirmed ? "" : " (dry run, nothing is deleted)"}`);

    // Every table that has a user_id column; the tables below them (sets, day exercises, ingredients) go by cascade.
    const { rows: tables } = await db.query(
      `SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name)
        WHERE c.table_schema = 'public' AND c.column_name = 'user_id' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
    );
    for (const { table_name: name } of tables) {
      const q = confirmed ? `DELETE FROM "${name}" WHERE user_id = $1` : `SELECT count(*)::int AS n FROM "${name}" WHERE user_id = $1`;
      const res = await db.query(q, [userId]);
      console.log(`${name}: ${confirmed ? res.rowCount : res.rows[0].n} ${confirmed ? "deleted" : "rows"}`);
    }
    if (confirmed) {
      for (const { table_name: name } of tables) {
        const left = (await db.query(`SELECT count(*)::int AS n FROM "${name}" WHERE user_id = $1`, [userId])).rows[0].n;
        if (left) throw new Error(`${name} still has ${left} rows: rolled back.`);
      }
    }
    await db.query(confirmed ? "COMMIT" : "ROLLBACK");
    console.log(confirmed ? "done: your account is empty (the sign-in account itself is kept)." : "dry run finished.");
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
