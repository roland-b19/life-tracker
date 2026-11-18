import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

if (process.env.CI) {
  // The CI job brings its own database through its env (.github/workflows/ci.yml); there is no default to fall back on.
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_MIGRATE) {
    throw new Error("In CI, DATABASE_URL and DATABASE_URL_MIGRATE must come from the job's env.");
  }
} else {
  // .env.example is the only place the local Docker credentials are written down (docker-compose.yml reads the same
  // names from .env, a copy of it). Read it directly, so no password is repeated in code.
  const local = parseEnv(readFileSync(".env.example", "utf8"));
  const testUrl = local.DATABASE_URL_TEST;
  if (!testUrl || !local.POSTGRES_PASSWORD) throw new Error(".env.example must define DATABASE_URL_TEST and POSTGRES_PASSWORD.");
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? testUrl;
  // The migrations run as the local superuser, on the same test database.
  const migrateUrl = new URL(testUrl);
  migrateUrl.username = "postgres";
  migrateUrl.password = local.POSTGRES_PASSWORD;
  process.env.DATABASE_URL_MIGRATE = migrateUrl.href;
}
