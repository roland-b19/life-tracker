import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page, type Request } from "@playwright/test";
import { Pool } from "pg";

// After a server action answers HTTP 2xx the app refreshes the router 600 ms after the last answer, and it also
// refreshes on focus, when it becomes visible and every minute (app/providers.tsx). A refresh rebuilds the tags React
// hoists into <head>, the <title> among them, so a scan that lands in the middle of one sees a page without a title
// (axe `document-title`) although the title was there a moment before. `watchRefreshes` follows the actions and the
// refreshes of a page, so a scan can wait for the refresh that is still due and for the ones under way. A write that
// failed or never got an answer refreshes nothing, so it makes nothing due.
const refreshesDue = new WeakMap<Page, { due: boolean; running: Set<Request> }>();

/** A router refresh of the page on screen: a page payload request (`rsc`) for the same path, not a prefetch. */
export function isRefresh(page: Page, request: Request) {
  const headers = request.headers();
  return (
    request.method() === "GET" &&
    "rsc" in headers &&
    !("next-router-prefetch" in headers) &&
    !("next-router-segment-prefetch" in headers) &&
    new URL(request.url()).pathname === new URL(page.url()).pathname
  );
}

function watchRefreshes(page: Page) {
  const state = { due: false, running: new Set<Request>() };
  let writes = 0;
  // The refresh requests that started after the last write, with the write count they saw.
  const covering = new Map<Request, number>();
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() === "POST" && "next-action" in request.headers() && response.ok()) {
      writes++;
      state.due = true;
    }
  });
  page.on("request", (request) => {
    if (!isRefresh(page, request)) return;
    state.running.add(request);
    if (state.due) covering.set(request, writes);
  });
  const ended = (request: Request) => {
    state.running.delete(request);
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
    state.running.clear();
    covering.clear();
  });
  refreshesDue.set(page, state);
}

// Resolves once <head> has not changed for a whole animation frame: the refresh response has arrived by then, but React
// commits it a few tasks later, and the commit removes and re-adds the head tags.
export function headIsQuiet() {
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
  if (state) {
    await expect
      .poll(() => state.due || state.running.size > 0, { message: "the refresh after the last server action, and those under way" })
      .toBe(false);
  }
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

/**
 * Resolves once the page has sent a marker request after everything it had already started. The page's requests are
 * reported in the order it sends them, so a refresh (or a write) the page was about to send has been seen by then.
 */
export async function settled(page: Page) {
  const marker = `/robots.txt?settled=${randomUUID()}`;
  const sent = page.waitForRequest((r) => r.url().endsWith(marker));
  await page.evaluate((url) => fetch(url).then(() => undefined, () => undefined), marker);
  await sent;
}

/** The middle of an element's box. */
export const center = (box: { x: number; y: number; width: number; height: number } | null) => {
  if (!box) throw new Error("not on screen");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// Two separate clicks on one spot, the way a quick double tap arrives: each is a click of its own (not a double click).
// The second comes about 40 ms after the first, and never before the first write's answer (a local answer takes about
// 25 ms), so it lands on whatever the first left there. Before that answer, the guard's per-target lock would refuse a
// repeat on the same target and hide whether the spot swallowed it; a tap on another target, such as the next row's
// Delete, would go through. Answers how many writes it set off. A second write starts during the second click, and a dialog
// it opens is on the page by then, so nothing waits by time: `settled` sees a write the click sent.
export async function burst(page: Page, { x, y }: { x: number; y: number }) {
  let acts = 0;
  const count = (r: Request) => {
    if (r.method() === "POST" && "next-action" in r.headers()) acts++;
  };
  page.on("request", count);
  const started = Date.now();
  await andSettle(page, () => page.mouse.click(x, y));
  await page.waitForTimeout(Math.max(0, 40 - (Date.now() - started)));
  await page.mouse.click(x, y);
  await settled(page);
  page.off("request", count);
  return acts;
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
