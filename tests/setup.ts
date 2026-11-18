import { localTestDatabase } from "./local-db";

if (process.env.CI) {
  // The CI job brings its own database through its env (.github/workflows/ci.yml); there is no default to fall back on.
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_MIGRATE) {
    throw new Error("In CI, DATABASE_URL and DATABASE_URL_MIGRATE must come from the job's env.");
  }
} else {
  const { appUrl, ownerUrl } = localTestDatabase();
  process.env.DATABASE_URL = appUrl;
  process.env.DATABASE_URL_MIGRATE = ownerUrl;
}
