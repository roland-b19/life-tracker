import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page, type Request } from "@playwright/test";
import { Pool } from "pg";

// After a server action the app refreshes the router 600 ms after the last one (app/providers.tsx). A refresh rebuilds
// the tags React hoists into <head>, the <title> among them, so a scan that lands in the middle of one sees a page
// without a title (axe `document-title`) although the title was there a moment before. `watchRefreshes` follows the
// actions and the refreshes of a page, so a scan can wait for the refresh that is still due.
const refreshesDue = new WeakMap<Page, { due: boolean }>();

function watchRefreshes(page: Page) {
  const state = { due: false };
  let writes = 0;
  // The refresh requests that started after the last write, with the write count they saw.
  const covering = new Map<Request, number>();
  page.on("request", (request) => {
    const headers = request.headers();
    if (request.method() === "POST" && "next-action" in headers) {
      writes++;
      state.due = true;
    } else if (
      state.due &&
      request.method() === "GET" &&
      "rsc" in headers &&
      !("next-router-prefetch" in headers) &&
      new URL(request.url()).pathname === new URL(page.url()).pathname
    ) {
      covering.set(request, writes);
    }
  });
  const ended = (request: Request) => {
    const seen = covering.get(request);
    covering.delete(request);
    // A later write schedules another refresh, so this one does not settle it.
    if (seen === writes) state.due = false;
  };
  page.on("requestfinished", ended);
  page.on("requestfailed", ended);
  // A new document drops the timer of the old one.
  page.on("load", () => {
    state.due = false;
    covering.clear();
  });
  refreshesDue.set(page, state);
}

// Resolves once <head> has not changed for a whole animation frame: the refresh response has arrived by then, but React
// commits it a few tasks later, and the commit removes and re-adds the head tags.
function headIsQuiet() {
  return new Promise<void>((resolve) => {
    let changed = false;
    const observer = new MutationObserver(() => (changed = true));
    observer.observe(document.head, { childList: true, subtree: true });
    const frame = () =>
      requestAnimationFrame(() => {
        if (changed) {
          changed = false;
          frame();
        } else {
          observer.disconnect();
          resolve();
        }
      });
    frame();
  });
}

// Serious and critical findings fail the spec. The scan waits for the refresh a write left due, then for a quiet <head>
// and a title; `next dev` also streams the title in after the content on a first load, so a title can be missing then too.
export async function expectNoSeriousViolations(page: Page) {
  const state = refreshesDue.get(page);
  if (state) await expect.poll(() => state.due, { message: "the refresh after the last server action" }).toBe(false);
  await page.evaluate(headIsQuiet);
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
      watchRefreshes(page);
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
