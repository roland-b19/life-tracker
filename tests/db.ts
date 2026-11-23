import type { Pool } from "pg";

/** Empties the unit tests' database: every table reaches `users` through a foreign key, so the cascade takes them all. */
export async function resetDb(admin: Pool) {
  await admin.query("TRUNCATE TABLE users CASCADE");
}
