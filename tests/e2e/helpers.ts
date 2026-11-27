import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, request as requests, test as base, type APIRequestContext, type Browser, type BrowserContextOptions, type Locator, type Page, type Request } from "@playwright/test";
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

/**
 * The warnings React logs from now on about a page that hydrated with other markup than the server sent, or about the
 * script tag the theme runs in <head> (InlineScript); the list grows as they come.
 */
export function hydrationWarnings(page: Page) {
  const seen: string[] = [];
  page.on("console", (m) => /hydrat|script tag/i.test(m.text()) && seen.push(m.text()));
  return seen;
}

/** The router refreshes of a page from now on (the list grows as they start). */
export function countRefreshes(page: Page) {
  const seen: Request[] = [];
  page.on("request", (r) => isRefresh(page, r) && seen.push(r));
  return seen;
}

/** A server action of the page: Next sends them as POSTs with this header. With `body`, only one whose body holds it. */
export function isWrite(request: Request, body?: string) {
  return request.method() === "POST" && "next-action" in request.headers() && (!body || (request.postData() ?? "").includes(body));
}

/** The server actions the page sends from now on (those whose body holds `body`, when given); the list grows as they start. */
export function countWrites(page: Page, body?: string) {
  const seen: Request[] = [];
  page.on("request", (r) => isWrite(r, body) && seen.push(r));
  return seen;
}

function watchRefreshes(page: Page) {
  const state = { due: false, running: new Set<Request>() };
  let writes = 0;
  // The refresh requests that started after the last write, with the write count they saw.
  const covering = new Map<Request, number>();
  page.on("response", (response) => {
    const request = response.request();
    if (isWrite(request) && response.ok()) {
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

/**
 * Resolves once the refresh the last server action left due, and every refresh under way, has finished (the page must
 * be the `signedInPage` fixture's, which `watchRefreshes` follows). A test that then changes the data elsewhere, or
 * signs the page out, knows the page's own refresh can no longer show that change. On a paused clock, `tick` moves it
 * that many ms before each look, so the refresh timer fires, and so does one a later write sets.
 */
export async function refreshesDone(page: Page, { tick = 0 } = {}) {
  const state = refreshesDue.get(page);
  if (!state) throw new Error("refreshesDone needs the signedInPage fixture's page");
  await expect
    .poll(
      async () => {
        if (tick) await page.clock.runFor(tick);
        return state.due || state.running.size > 0;
      },
      { message: "the refresh after the last server action, and those under way" },
    )
    .toBe(false);
}

/**
 * Signs the page out once its own refreshes are done (`refreshesDone`), and holds every refresh of the page on screen
 * after that: the app refreshes 600 ms after any answer, and a signed-out refresh goes to the sign-in form, so holding
 * it keeps on screen what a refused write left there.
 */
export async function signOutHere(page: Page) {
  await refreshesDone(page);
  const path = new URL(page.url()).pathname;
  await page.route((url) => url.pathname === path, (route) => (isRefresh(page, route.request()) ? undefined : route.fallback()));
  await page.context().clearCookies();
}

// Serious and critical findings fail the spec. The scan waits for the refresh a write left due, then for a quiet <head>
// and a title; `next dev` also streams the title in after the content on a first load, so a title can be missing then too.
export async function expectNoSeriousViolations(page: Page) {
  if (refreshesDue.has(page)) await refreshesDone(page);
  await page.evaluate(headIsQuiet);
  await expect(page).toHaveTitle(/.+/);
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

// A click that starts a server action returns once the action has answered, so the next step never races the database
// (a reload would otherwise abort an action still in flight).
// `body` (a piece of the request body, such as a title) names the action to wait for when another action of the page,
// an earlier one still unanswered, could be taken for it.
export async function andSettle(page: Page, act: () => Promise<void>, body?: string) {
  const answered = page.waitForResponse((r) => isWrite(r.request(), body));
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

/**
 * Taps `target` (a spot, or the middle of an element, read just before the tap) `ms` after `started` (a `Date.now()`),
 * or at once when that time has passed: the rhythm of a human double tap, the one time wait the specs allow (D-047).
 * Answers how many ms after `started` the tap went.
 */
export async function tapAfter(page: Page, started: number, ms: number, target: { x: number; y: number } | Locator) {
  await page.waitForTimeout(Math.max(0, ms - (Date.now() - started)));
  const { x, y } = "x" in target ? target : center(await target.boundingBox());
  const at = Date.now() - started;
  await page.mouse.click(x, y);
  return at;
}

// Two separate clicks on one spot, the way a quick double tap arrives: each is a click of its own (not a double click).
// The second comes about 40 ms after the first, and never before the first write's answer (a local answer takes about
// 25 ms), so it lands on whatever the first left there. Before that answer, the guard's per-target lock would refuse a
// repeat on the same target and hide whether the spot swallowed it; a tap on another target, such as the next row's
// Delete, would go through. Answers how many writes it set off. A second write starts during the second click, and a dialog
// it opens is on the page by then, so nothing else waits by time: `settled` sees a write the click sent.
export async function burst(page: Page, spot: { x: number; y: number }) {
  let acts = 0;
  const count = (r: Request) => {
    if (isWrite(r)) acts++;
  };
  page.on("request", count);
  const started = Date.now();
  await andSettle(page, () => page.mouse.click(spot.x, spot.y));
  await tapAfter(page, started, 40, spot);
  await settled(page);
  page.off("request", count);
  return acts;
}

// The writes of a `burst` whose body holds `body`, for a page that sends other actions around them.
export async function writesIn(page: Page, spot: { x: number; y: number }, body: string) {
  let writes = 0;
  const count = (r: Request) => {
    if (isWrite(r, body)) writes++;
  };
  page.on("request", count);
  await burst(page, spot);
  page.off("request", count);
  return writes;
}

/**
 * Stops the page's clock (installed before the page loaded) where it stands: from here on no timer fires until
 * `runFor`, `fastForward` or `resume`. `pauseAt` refuses a time the clock has passed, and the running clock moves on
 * between reading it and pausing; a refused `pauseAt` has paused the clock already, so the next read is exact. It is
 * tried until it takes, however slow the calls are.
 */
export async function pauseClock(page: Page) {
  await expect(async () => {
    await page.clock.pauseAt(await page.evaluate(() => Date.now()));
  }).toPass({ timeout: 5_000 });
}

/**
 * Installs the page's clock standing still at `time` (now by default; a few milliseconds later, where `pauseClock`
 * stops it), before the page loads: only `runFor`, `fastForward` and `resume` move it, however long the page takes to
 * load.
 */
export async function installStoppedClock(page: Page, time = Date.now()) {
  await page.clock.install({ time });
  await pauseClock(page);
}

/**
 * Holds the page's server actions from now on (those whose body holds `body`, when given) until the returned
 * `release(lose)`; a held write has reached the server only once released. After it they go through, or, with
 * `lose`, they and the later ones are lost on the way (the page sees a network error and the server writes nothing).
 * `release` resolves once the writes held so far have gone on. The route is the path of the page on screen, where
 * Next sends them.
 */
export async function holdWrites(page: Page, body?: string) {
  let open: (lose: boolean) => void = () => {};
  const held = new Promise<boolean>((resolve) => (open = resolve));
  const gone: Promise<void>[] = [];
  const path = new URL(page.url()).pathname;
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      if (!isWrite(route.request(), body)) return route.fallback();
      let wentOn = () => {};
      gone.push(new Promise<void>((resolve) => (wentOn = resolve)));
      if (await held) await route.abort();
      else await route.fallback();
      wentOn();
    },
  );
  return async (lose = false) => {
    open(lose);
    await Promise.all(gone);
  };
}

/**
 * The first server action of the page on screen whose body holds `marker` reaches the server, which writes, but its
 * answer is lost on the way back (the page sees a network error). Answers what that write sent.
 */
export async function loseAnswerOnce(page: Page, marker: string) {
  let sent = "";
  const path = new URL(page.url()).pathname;
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      const request = route.request();
      const body = request.postData() ?? "";
      if (sent || !isWrite(request, marker)) return route.fallback();
      sent = body;
      await onNewConnection(page, (api) => api.fetch(request));
      await route.abort();
    },
  );
  return () => sent;
}

/**
 * Every server action of the page on screen whose body holds `marker` reaches the server, and its answer is changed on
 * the way back: the page gets `change(text)` in place of the answer's text.
 */
export async function changeAnswers(page: Page, marker: string, change: (text: string) => string) {
  const path = new URL(page.url()).pathname;
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      if (!isWrite(route.request(), marker)) return route.fallback();
      await onNewConnection(page, async (api) => {
        const answer = await api.fetch(route.request());
        // The body is read decoded and changed, so its length and encoding headers no longer apply.
        const headers = Object.fromEntries(Object.entries(answer.headers()).filter(([k]) => !["content-length", "content-encoding", "transfer-encoding"].includes(k)));
        await route.fulfill({ response: answer, body: change(await answer.text()), headers });
      });
    },
  );
}

/** Holds the page's refreshes (D-034) from now on until the returned `release()`, which lets them through and waits for them. */
export async function holdRefreshes(page: Page) {
  let open = () => {};
  const held = new Promise<void>((resolve) => (open = resolve));
  const path = new URL(page.url()).pathname;
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      if (!isRefresh(page, route.request())) return route.fallback();
      await held;
      await route.fallback();
    },
  );
  return async () => {
    open();
    await refreshesDone(page);
  };
}

/**
 * Records each state the page shows from now on, as `sample(arg)` reads it in the page (undefined: nothing to record
 * now), and answers a function that reads the states seen so far. A MutationObserver sees each change of the DOM, so no
 * state slips between two checks; the document stays across client navigations (a reload would drop the record).
 */
export async function recordStates<A>(page: Page, sample: (arg: A) => string | undefined, arg?: A) {
  await page.evaluate(`(() => {
    const sample = (${sample.toString()});
    const arg = ${JSON.stringify(arg ?? null)};
    const seen = [];
    const record = () => {
      const state = sample(arg);
      if (state !== undefined && seen.at(-1) !== state) seen.push(state);
    };
    record();
    new MutationObserver(record).observe(document.body, { childList: true, subtree: true, characterData: true });
    window.seenStates = seen;
  })()`);
  return () => page.evaluate(() => (window as unknown as { seenStates: string[] }).seenStates);
}

/** For `recordStates`: the Wishlist's item list with `item` ("item") or without it ("none"), else the path on screen. */
export function wishlistItemState(item: string) {
  if (location.pathname !== "/wishlist") return location.pathname;
  const list = [...document.querySelectorAll("section")].find((s) => /^Items\b/.test(s.querySelector("h2")?.textContent ?? ""));
  if (!list) return undefined;
  return list.textContent?.includes(item) ? "item" : "none";
}

/** The toast that shows `text`. */
export const toast = (page: Page, text: string | RegExp) => page.locator(".toast-item").filter({ hasText: text });

/** The Undo button of the toast that shows `text`. */
export const undoIn = (page: Page, text: string | RegExp) => toast(page, text).getByRole("button", { name: "Undo" });

/**
 * Checks that the toast that shows `text` is on screen without an Undo (a newer change took it away, or it never had
 * one). A toast runs out after 5 s, and a toast gone has no Undo either, so the page's clock must stand still from
 * before the toast showed (`page.clock.install()` before the page opens, then `pauseClock`) however slow the run is;
 * the check fails when the clock moved while it ran.
 */
export async function expectToastWithoutUndo(page: Page, text: string | RegExp) {
  const now = () => page.evaluate(() => Date.now());
  const held = await now();
  await expect(toast(page, text)).toBeVisible();
  await expect(undoIn(page, text)).toHaveCount(0);
  expect(await now(), "the page's clock stands still (pauseClock)").toBe(held);
}

/**
 * Closes the one toast on screen with its Dismiss button (one Undo or Dismiss at a time: a second toast fails the click)
 * and waits until it has gone: no Dismiss is left, and `message`, when given, is off the page. A toast among others is
 * closed with `toast(page, text)`'s own Dismiss button.
 */
export async function dismissToast(page: Page, message?: string | RegExp) {
  const dismiss = page.getByRole("button", { name: "Dismiss notification" });
  await dismiss.click();
  if (message !== undefined) await expect(page.getByText(message)).toBeHidden();
  await expect(dismiss).toHaveCount(0);
}

/** The Appearance card of Settings. */
export const appearance = (page: Page) => page.getByRole("region", { name: "Appearance", exact: true });

/** The theme the page shows: "light", "dark" or "auto" (the system's). */
export const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme ?? "auto");

/** A wishlist (or shopping) item name, new on each run. */
export const itemName = () => `E2E item ${randomUUID().slice(0, 8)}`;

/** Opens the Wishlist and waits until it takes input. */
export async function openWishlist(page: Page) {
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
}

/**
 * Adds a wishlist item through the New item form and waits for its row and its toast; `toastPrice` is the price as the
 * toast shows it.
 */
export async function addItem(page: Page, name: string, price = "100", toastPrice = price) {
  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New item" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByLabel("Price (RON)").fill(price);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"name":"${name}"`);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByText(`Added "${name}" (${toastPrice} RON)`, { exact: true })).toBeVisible();
  // Ends the tap burst (D-043), so the next tap is a new one.
  await page.keyboard.press("Shift");
}

/**
 * The owner role, for what a page cannot see or do: counting rows, a change made elsewhere, deleting users (the app role
 * cannot). The config refuses a non-local DATABASE_URL_MIGRATE, so this only ever touches the local test database.
 */
export async function asOwner<T>(run: (db: Pool) => Promise<T>) {
  const db = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
  try {
    return await run(db);
  } finally {
    await db.end();
  }
}

/** A dev user name, new on each run. */
export const devUserName = () => `e2e-${randomUUID().slice(0, 8)}`;

/** Deletes the dev users of these names; their rows go with them (ON DELETE CASCADE). */
export function deleteDevUsers(...names: string[]) {
  return asOwner((db) => db.query("DELETE FROM users WHERE issuer = 'dev' AND subject = ANY($1)", [names]));
}

/** The number of dev users of these names. */
export async function devUserCount(...names: string[]) {
  return (await asOwner((db) => db.query("SELECT 1 FROM users WHERE issuer = 'dev' AND subject = ANY($1)", [names]))).rowCount;
}

/**
 * Runs `send` with a request context of its own holding the page's cookies, and disposes it afterwards, also when `send`
 * throws: the one way a spec sends a request itself (sign-in, a check, a route's request sent on to the server). Each
 * context opens a new connection. A context kept between requests (`page.request`, which a route's `fetch()` also sends on)
 * reuses its connection, and the dev server closes one idle for 5 s (Node's keepAliveTimeout). A request sent on it a few
 * seconds after the last one, while the server's event loop is busy (other workers' pages, a compile), reaches the
 * server after that timeout has fired: the server drops the connection and the request fails with ECONNRESET.
 */
export async function onNewConnection<T>(page: Page, send: (api: APIRequestContext) => Promise<T>) {
  const cookies = await page.context().cookies();
  const api = await requests.newContext({ baseURL: base.info().project.use.baseURL, storageState: { cookies, origins: [] } });
  try {
    return await send(api);
  } finally {
    await api.dispose();
  }
}

/** The signed-in user's id, from the session the page has, for the SQL that checks or seeds their rows. */
export function signedInUserId(page: Page) {
  return onNewConnection(page, async (api) => (await (await api.get("/api/auth/session")).json()).user.id as string);
}

/**
 * Another device of the page's user: a browser context of its own (with `options`, such as a phone's viewport and touch)
 * holding only the page's cookies, so it shares the session but none of the page's localStorage. Close it with
 * `close()` on the returned context.
 */
export async function newDevice(browser: Browser, page: Page, options?: BrowserContextOptions) {
  const device = await browser.newContext(options);
  await device.addCookies(await page.context().cookies());
  return device;
}

/**
 * Signs a fresh browser in through the /signin form as a new dev user, typing and pressing Continue as soon as the form
 * lets it (it waits for its session check, so nothing typed is lost), and checks the user is signed in as that name: a
 * signed-out visit to `path` goes to the form, which comes back to `path` (the form opened on its own lands on /todos),
 * `landed` sees the page, and the name has a user row (a refused sign-in would bounce back to /signin). `signedIn` runs
 * next with the name; the user is deleted afterwards.
 */
export async function signInThroughForm(page: Page, path: string, landed: (page: Page) => Promise<void>, signedIn?: (name: string) => Promise<void>) {
  const name = devUserName();
  try {
    await page.goto(path, { waitUntil: "commit" });
    if (path !== "/signin") await expect(page).toHaveURL(new RegExp(`/signin\\?next=${encodeURIComponent(path)}$`));
    await page.getByLabel("Username").fill(name);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(new RegExp(`${path === "/signin" ? "/todos" : path}$`));
    await landed(page);
    expect(await devUserCount(name)).toBe(1);
    await signedIn?.(name);
  } finally {
    await deleteDevUsers(name);
  }
}

async function signIn(page: Page, name: string) {
  // Sign in through NextAuth's own endpoints instead of the form: faster, and the form itself is tested in
  // navigation.spec.ts. The session cookie the answer sets goes to the page.
  await onNewConnection(page, async (api) => {
    const { csrfToken } = await (await api.get("/api/auth/csrf")).json();
    const response = await api.post("/api/auth/callback/credentials", {
      form: { csrfToken, name, json: "true" },
    });
    expect(response.ok()).toBe(true);
    await page.context().addCookies((await api.storageState()).cookies);
  });
  // Without a session the next page would bounce back to /signin.
  await page.goto("/health");
  await expect(page).toHaveURL(/\/health$/);
}

// `signedInPage` signs in as a new dev user and deletes that user afterwards (`deleteDevUsers`, as the owner role: the
// app role cannot delete users).
export const test = base.extend<{ signedInPage: Page }>({
  signedInPage: async ({ page }, provide) => {
    const name = devUserName();
    try {
      watchRefreshes(page);
      await signIn(page, name);
      await provide(page);
    } finally {
      await deleteDevUsers(name);
    }
  },
});
