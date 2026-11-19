import { defineConfig, devices } from "@playwright/test";
// Sets DATABASE_URL the way the Vitest tests get it: the job's database in CI, otherwise the local test database.
import "./tests/setup";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const databaseUrl = process.env.DATABASE_URL!;

// CI=1 with a remote DATABASE_URL could point the dev server at a real database; a spec only ever runs against a
// local one. The specs also clean up with DATABASE_URL_MIGRATE (the owner role), so it gets the same check.
for (const url of [databaseUrl, process.env.DATABASE_URL_MIGRATE!]) {
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    throw new Error("The e2e specs only run against a local database.");
  }
}

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/global-setup.ts",
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
  // Playwright's default scheme is light, so the dark projects say so. With Auto the page follows colorScheme.
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], colorScheme: "dark" } },
    {
      name: "phone",
      // The phone target is the width, so no touch or mobile emulation. Only the axe scans depend on the width and
      // the color scheme, so the other projects run just the tests tagged @a11y; the flows run once, on desktop.
      grep: /@a11y/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, colorScheme: "dark" },
    },
    { name: "desktop-light", grep: /@a11y/, use: { ...devices["Desktop Chrome"], colorScheme: "light" } },
    {
      name: "phone-light",
      grep: /@a11y/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, colorScheme: "light" },
    },
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
      // The Settings page and its Claude card render only with the flag on, and the card encrypts a token with the key.
      // The key is throwaway and e2e only, like NEXTAUTH_SECRET: the specs only ever store a fake token.
      NEXT_PUBLIC_CLAUDE_ENABLED: "true",
      CLAUDE_TOKEN_KEY: Buffer.alloc(32, "e2e-only").toString("base64"),
    },
  },
});
