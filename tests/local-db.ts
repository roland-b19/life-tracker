import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// The local test database of this checkout. The main folder uses `life_tracker_test` from .env.example; a worktree
// (.claude/worktrees/<name>) gets its own `life_tracker_test_<name>`, so parallel sessions never truncate each other's data.
// .env.example is the only place the local Docker credentials are written down (D-006): read it, repeat no password in code.
export function localTestDatabase() {
  const local = parseEnv(readFileSync(".env.example", "utf8"));
  const baseUrl = local.DATABASE_URL_TEST;
  if (!baseUrl || !local.POSTGRES_PASSWORD) throw new Error(".env.example must define DATABASE_URL_TEST and POSTGRES_PASSWORD.");

  const cwd = process.cwd().split(path.sep);
  const at = cwd.lastIndexOf("worktrees");
  const worktree = at > 0 && cwd[at - 1] === ".claude" ? cwd[at + 1] : undefined;
  // Postgres names are at most 63 bytes; the base name takes 16 and the underscore one.
  const slug = worktree?.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

  const appUrl = new URL(baseUrl);
  const name = slug ? `${appUrl.pathname.slice(1)}_${slug}` : appUrl.pathname.slice(1);
  appUrl.pathname = `/${name}`;
  // The migrations run as the local superuser, on the same database.
  const ownerUrl = new URL(appUrl);
  ownerUrl.username = "postgres";
  ownerUrl.password = local.POSTGRES_PASSWORD;
  return { name, appUrl: appUrl.href, ownerUrl: ownerUrl.href };
}

// Creates the database when it is missing (the Docker init script only makes the main one) and brings it up to date; a
// no-op when it is current. Local Docker only: it runs as the local superuser.
export async function prepareLocalTestDatabase() {
  const { name, ownerUrl } = localTestDatabase();
  const maintenanceUrl = new URL(ownerUrl);
  maintenanceUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: maintenanceUrl.href, max: 1 });
  try {
    const found = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (found.rowCount === 0) {
      // The name is derived from a folder name reduced to [a-z0-9_], so it is safe to quote into the statement.
      await admin.query(`CREATE DATABASE "${name}" OWNER life_tracker_owner`);
    }
  } finally {
    await admin.end();
  }

  const db = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    // Same grants as docker/postgres/init.sh gives the main test database; all of them are idempotent.
    await db.query(`GRANT CONNECT ON DATABASE "${name}" TO life_tracker_app`);
    await db.query("GRANT USAGE ON SCHEMA public TO life_tracker_app");
    await db.query("REVOKE CREATE ON SCHEMA public FROM life_tracker_app");
    await migrate(drizzle(db), { migrationsFolder: "drizzle" });
  } finally {
    await db.end();
  }
}
