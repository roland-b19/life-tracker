import { prepareLocalTestDatabase } from "./local-db";

// Used by Vitest and Playwright. In CI the job brings its own migrated database, so there is nothing to prepare.
export default async function globalSetup() {
  if (!process.env.CI) await prepareLocalTestDatabase();
}
