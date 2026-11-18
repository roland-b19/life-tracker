import { defineConfig, devices } from "@playwright/test";
// Sets DATABASE_URL the way the Vitest tests get it: the job's database in CI, otherwise the local test database.
import "./tests/setup";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const databaseUrl = process.env.DATABASE_URL!;

// A shell-exported DATABASE_URL_TEST, or CI=1 with a remote DATABASE_URL, could point the dev server at a real
// database; a spec only ever runs against a local one.
if (!["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The e2e specs only run against a local database.");
}

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "html" : "line",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // The phone target is the width, so no touch or mobile emulation.
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    // AUTH_DEV throws under NODE_ENV=production, so the specs cannot use a production build.
    command: `npx next dev --port ${PORT}`,
    url: `${BASE_URL}/signin`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AUTH_DEV: "true",
      NEXTAUTH_URL: BASE_URL,
      NEXTAUTH_SECRET: "e2e-only-secret",
      DATABASE_URL: databaseUrl,
    },
  },
});
