import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";
import { Pool } from "pg";

// Serious and critical findings fail the spec. `next dev` streams the page's <title> in after the content, so a scan
// that starts at once can see a document without one (axe `document-title`): wait for the title first.
export async function expectNoSeriousViolations(page: Page) {
  await expect(page).toHaveTitle(/.+/);
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

// A click that starts a server action returns once the action has answered, so the next step never races the database
// (a reload would otherwise abort an action still in flight). Next sends server actions as POSTs with this header.
// A page that refreshes its list after a write sends a second action, so `body` (a piece of the request body, such as
// a title) names the action to wait for when an earlier refresh may still be in flight and would be taken for it.
export async function andSettle(page: Page, act: () => Promise<void>, body?: string) {
  const answered = page.waitForResponse((r) => {
    const request = r.request();
    return request.method() === "POST" && "next-action" in request.headers() && (!body || (request.postData() ?? "").includes(body));
  });
  await act();
  await answered;
}

async function signIn(page: Page, name: string) {
  // Sign in through NextAuth's own endpoints instead of the form. On /signin two parallel /api/auth/session calls each
  // set a CSRF cookie, so a click that comes too early posts a stale token and no session is created. Here the token and
  // its cookie come from one request, and the request context shares its cookie jar with the page.
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  const response = await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, name, json: "true" },
  });
  expect(response.ok()).toBe(true);
  // Without a session the next page would bounce back to /signin.
  await page.goto("/health");
  await expect(page).toHaveURL(/\/health$/);
}

// `signedInPage` signs in as a new dev user and deletes that user afterwards; the user's rows go with it (ON DELETE
// CASCADE). The app role cannot delete users, so the cleanup uses the owner URL like the Vitest tests do. The config
// refuses a non-local DATABASE_URL and DATABASE_URL_MIGRATE, so this only ever touches the local test database.
export const test = base.extend<{ signedInPage: Page }>({
  signedInPage: async ({ page }, provide) => {
    const name = `e2e-${randomUUID().slice(0, 8)}`;
    const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
    try {
      await signIn(page, name);
      await provide(page);
    } finally {
      try {
        await admin.query("DELETE FROM users WHERE issuer = 'dev' AND subject = $1", [name]);
      } finally {
        await admin.end();
      }
    }
  },
});
