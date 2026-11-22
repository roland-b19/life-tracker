import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page, type Request } from "@playwright/test";
import { Pool } from "pg";
import { andSettle, headIsQuiet, isRefresh, settled, test } from "./helpers";

// The app shell (app/providers.tsx): open copies stay in sync, writes without an answer say why, midnight moves the
// page to the new day, a refresh missed offline runs once the server answers again, a broken page answer says so, and
// the Undo toasts keep a Retry for a failed restore.
// Nothing waits by time: a check that something did not happen runs the page's clock past the moment it would have
// happened (`page.clock.runFor`, which also fires the timers set on the way, unlike `fastForward`), then waits until the
// page has sent a request of its own (`settled`).

async function openWishlist(page: Page) {
  await page.goto("/wishlist");
  await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
}

async function addItem(page: Page, name: string) {
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Price (RON)").fill("100");
  await andSettle(page, () => page.getByRole("button", { name: "Save" }).click());
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

/** The router refreshes of a page from now on. */
function countRefreshes(page: Page) {
  const seen: Request[] = [];
  page.on("request", (r) => isRefresh(page, r) && seen.push(r));
  return seen;
}

const itemName = () => `Shell ${randomUUID().slice(0, 8)}`;

/**
 * Takes this one page offline and back through Chromium's network emulation (what DevTools' Offline does). Unlike
 * `context.setOffline`, which can let the page hear "online" before every part of its network is back, the page's
 * network and `navigator.onLine` change in one step, so a test sees the app's behavior and not that gap.
 */
async function network(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  return (online: boolean) =>
    cdp.send("Network.emulateNetworkConditions", { offline: !online, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}

/** The server checks the page sends before a refresh it missed while offline. */
function countChecks(page: Page) {
  const seen: Request[] = [];
  page.on("request", (r) => new URL(r.url()).pathname === "/api/health" && seen.push(r));
  return seen;
}

// A page load would drop this mark
const markPage = (page: Page) => page.evaluate(() => ((window as unknown as { kept: boolean }).kept = true));
const isKept = (page: Page) => page.evaluate(() => (window as unknown as { kept?: boolean }).kept === true);

test("a save in one tab refreshes another tab of the same browser within 2 s [SYNC]", async ({ signedInPage: page }) => {
  const other = await page.context().newPage();
  await openWishlist(page);
  await openWishlist(other);
  const refreshed = other.waitForRequest((r) => isRefresh(other, r));
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Name", { exact: true }).fill(itemName());
  await page.getByLabel("Price (RON)").fill("100");
  // The 2 s count from the write's answer, so they measure the other tab's update only, not the form fill
  await andSettle(page, () => page.getByRole("button", { name: "Save" }).click());
  const answered = Date.now();
  await refreshed;
  expect(Date.now() - answered).toBeLessThan(2000);
  await other.close();
});

test("another browser refreshes when it gets the focus back [SYNC]", async ({ signedInPage: page, browser }) => {
  const context = await browser.newContext();
  await context.addCookies(await page.context().cookies());
  const other = await context.newPage();
  try {
    await other.clock.install();
    await openWishlist(other);
    await openWishlist(page);
    const refreshes = countRefreshes(other);
    // The writing tab refreshes 600 ms after the answer, so the write's message has gone out by then
    const ownRefresh = page.waitForRequest((r) => isRefresh(page, r));
    await addItem(page, itemName());
    await ownRefresh;
    // Another browser hears nothing of the write: past the 600 ms a message would wait, and past the two seconds after
    // its load in which a focus refreshes nothing, it has not refreshed
    await other.clock.runFor(2000);
    await settled(other);
    expect(refreshes).toHaveLength(0);
    const refreshed = other.waitForRequest((r) => isRefresh(other, r), { timeout: 2000 });
    await other.evaluate(() => window.dispatchEvent(new Event("focus")));
    await refreshed;
  } finally {
    await context.close();
  }
});

test("an open page refreshes once at midnight in Bucharest [MIDNIGHT]", async ({ signedInPage: page }) => {
  // 23:59:30 in Bucharest; the 60 s refresh of an open page is still 60 s away when midnight comes
  await page.clock.install({ time: new Date("2026-11-20T21:59:30Z") });
  await openWishlist(page);
  const refreshes = countRefreshes(page);
  await page.clock.runFor(20_000);
  await settled(page);
  expect(refreshes).toHaveLength(0);
  await page.clock.runFor(20_000);
  await expect.poll(() => refreshes.length).toBe(1);
  // And only once: the next day's timer does not fire again (still before the 60 s refresh, due at 00:00:30)
  await page.clock.runFor(5_000);
  await settled(page);
  expect(refreshes).toHaveLength(1);
});

test("a write while offline says nothing was saved and leaves the form open [X-OFFLINE, PROD-01, XR-01]", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openWishlist(page);
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Name", { exact: true }).fill(itemName());
  await page.getByLabel("Price (RON)").fill("100");
  const refreshes = countRefreshes(page);
  await page.context().setOffline(true);
  try {
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("You're offline. Nothing was saved.")).toBeVisible();
    // Past the 600 ms after which a refresh would come
    await page.clock.runFor(2000);
  } finally {
    await page.context().setOffline(false);
  }
  await settled(page);
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(refreshes).toHaveLength(0);
});

test("a refresh that comes due while offline runs once, on screen, when the device is back online", async ({ signedInPage: page }) => {
  const before = `Shell ex ${randomUUID().slice(0, 8)}`;
  const after = `Renamed ex ${randomUUID().slice(0, 8)}`;
  const { user } = await (await page.request.get("/api/auth/session")).json();
  // Another device renames the exercise; the owner role writes it straight to the local test database
  const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
  try {
    await admin.query("INSERT INTO exercises (user_id, name, muscle_group, equipment_type, is_custom) VALUES ($1, $2, 'chest', 'barbell', true)", [
      user.id,
      before,
    ]);
    await page.clock.install();
    await page.goto("/gym");
    // "My exercises" shows the page's data as it comes, so a refresh shows on screen
    const mine = page.getByRole("region", { name: "My exercises" });
    await expect(mine.getByText(before, { exact: true })).toBeVisible();
    await markPage(page);
    const refreshes = countRefreshes(page);
    const checks = countChecks(page);
    const setOnline = await network(page);
    await setOnline(false);
    await admin.query("UPDATE exercises SET name = $1 WHERE user_id = $2 AND name = $3", [after, user.id, before]);
    // Past the 60 s refresh of an open page, which comes due while offline
    await page.clock.runFor(61_000);
    await settled(page);
    expect(refreshes).toHaveLength(0);
    await setOnline(true);
    await expect(mine.getByText(after, { exact: true })).toBeVisible();
    expect(checks).toHaveLength(1);
    expect(refreshes).toHaveLength(1);
    // Offline and back again with nothing due: no second check and no second refresh
    await setOnline(false);
    await settled(page);
    await setOnline(true);
    // Past the 600 ms a refresh could wait, and still before the next 60 s refresh
    await page.clock.runFor(2000);
    await settled(page);
    expect(checks).toHaveLength(1);
    expect(refreshes).toHaveLength(1);
    expect(await isKept(page)).toBe(true);
  } finally {
    await admin.end();
  }
});

test("back online, a refresh waits until the server answers, so an open form keeps its text", async ({ signedInPage: page }) => {
  const name = itemName();
  await page.clock.install();
  await openWishlist(page);
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await markPage(page);
  const refreshes = countRefreshes(page);
  const checks = countChecks(page);
  const setOnline = await network(page);
  await setOnline(false);
  await page.clock.runFor(61_000);
  await settled(page);
  // The device says it is online, but the server is not reachable yet: a refresh sent now would fail, and Next would
  // turn it into a full page load
  await page.route("**/*", (route) => route.abort("internetdisconnected"));
  await setOnline(true);
  await page.clock.runFor(2000);
  await settled(page);
  expect(checks).toHaveLength(1);
  expect(refreshes).toHaveLength(0);
  expect(await isKept(page)).toBe(true);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
  // The next trigger, with the server answering, refreshes once
  await page.unroute("**/*");
  await setOnline(false);
  await settled(page);
  await setOnline(true);
  await expect.poll(() => refreshes.length).toBe(1);
  await page.clock.runFor(2000);
  await settled(page);
  expect(checks).toHaveLength(2);
  expect(refreshes).toHaveLength(1);
  expect(await isKept(page)).toBe(true);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
});

test("coming back online with no refresh due refreshes nothing", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openWishlist(page);
  const refreshes = countRefreshes(page);
  const checks = countChecks(page);
  const setOnline = await network(page);
  await setOnline(false);
  await settled(page);
  await setOnline(true);
  // Past the 600 ms a refresh could wait, and still before the 60 s refresh of an open page
  await page.clock.runFor(2000);
  await settled(page);
  expect(checks).toHaveLength(0);
  expect(refreshes).toHaveLength(0);
});

test("a write whose answer is lost while online says so and refreshes [XR-04]", async ({ signedInPage: page }) => {
  await openWishlist(page);
  await page.route("**/wishlist", (route) => (route.request().method() === "POST" ? route.abort() : route.fallback()));
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Name", { exact: true }).fill(itemName());
  await page.getByLabel("Price (RON)").fill("100");
  const refreshed = page.waitForRequest((r) => isRefresh(page, r));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Couldn't confirm the change. Reloaded.")).toBeVisible();
  await refreshed;
  await page.unroute("**/wishlist");
});

// A tap on a link while a write is unanswered, or before the refresh it left due, waits until that refresh has started
// (the page it would open is the copy from before the write). The tests below hold the answer of a Wishlist write.

/** Holds the answers of the Wishlist's writes from now on until `release`; `answered` resolves on the first answer. */
async function holdWrites(page: Page) {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/wishlist", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.fallback();
  });
  const answered = page.waitForResponse((r) => r.request().method() === "POST");
  return { release, answered };
}

/** A page request of a navigation to another page: not a prefetch, not a refresh of the page on screen. */
function isOpen(page: Page, request: Request) {
  const headers = request.headers();
  const path = new URL(request.url()).pathname;
  return (
    request.method() === "GET" &&
    "rsc" in headers &&
    !("next-router-prefetch" in headers) &&
    !("next-router-segment-prefetch" in headers) &&
    path !== new URL(page.url()).pathname
  );
}

/** The paths of the pages a navigation asked for from now on. */
function countOpens(page: Page) {
  const seen: string[] = [];
  page.on("request", (r) => isOpen(page, r) && seen.push(new URL(r.url()).pathname));
  return seen;
}

/** Waits until a refresh has answered and the page has shown it, so it cannot land after a later write. */
async function waitForRefresh(refresh: Promise<Request>) {
  const request = await refresh;
  await request.response();
  await request.frame().page().evaluate(headIsQuiet);
}

/** Stops the page's clock (installed before the page loaded) a moment from now: from here on no timer fires. */
async function stopClock(page: Page) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
}

// A write that never answers lets the tap through after 10 s, so the app is never stuck on one page.
test("a tap on a link while a write is unanswered waits for the answer, at most 10 s [WISH-13]", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openWishlist(page);
  const name = itemName();
  await addItem(page, name);
  const { release, answered } = await holdWrites(page);
  const opens = countOpens(page);
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await expect(page.getByText(name, { exact: true })).toBeHidden();
  await page.getByRole("link", { name: "Tasks" }).first().click();
  // Just short of 10 s the tap still waits: Tasks was not even asked for
  await page.clock.runFor(9_000);
  await settled(page);
  expect(opens).toHaveLength(0);
  await expect(page).toHaveURL(/\/wishlist$/);
  await page.clock.runFor(1_000);
  await expect(page).toHaveURL(/\/todos$/);
  release();
  await answered;
});

test("a tap that waits goes through as soon as the refresh after the answer starts, with no timer [WISH-13]", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openWishlist(page);
  const name = itemName();
  const addRefresh = page.waitForRequest((r) => isRefresh(page, r));
  await addItem(page, name);
  await waitForRefresh(addRefresh);
  // Neither the 600 ms after an answer nor the 10 s cap can fire now: only the answer can start the refresh, and only
  // the refresh can let the tap through
  await stopClock(page);
  const { release, answered } = await holdWrites(page);
  const events: string[] = [];
  page.on("response", (r) => r.request().method() === "POST" && events.push("answer"));
  page.on("request", (r) => {
    if (isRefresh(page, r)) events.push("refresh");
    else if (isOpen(page, r)) events.push(new URL(r.url()).pathname);
  });
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await expect(page.getByText(name, { exact: true })).toBeHidden();
  await page.getByRole("navigation", { name: "Main Navigation" }).getByRole("link", { name: "Tasks" }).click();
  await settled(page);
  expect(events).toEqual([]);
  release();
  await answered;
  // The refresh starts on the answer itself
  await expect.poll(() => events.slice(0, 2)).toEqual(["answer", "refresh"]);
  // And the tap goes through once that refresh has started
  await expect.poll(() => events).toEqual(["answer", "refresh", "/todos"]);
  await expect(page).toHaveURL(/\/todos$/);
});

test("of several taps on links while a write is unanswered, only the latest goes through, once [WISH-13]", async ({ signedInPage: page }) => {
  await openWishlist(page);
  const name = itemName();
  await addItem(page, name);
  const { release, answered } = await holdWrites(page);
  const opens = countOpens(page);
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await expect(page.getByText(name, { exact: true })).toBeHidden();
  const nav = page.getByRole("navigation", { name: "Main Navigation" });
  await nav.getByRole("link", { name: "Tasks" }).click();
  await nav.getByRole("link", { name: "Health" }).click();
  // A screen reader activates a link with a click alone, with no pointer or key before it
  await nav.getByRole("link", { name: "Gym" }).dispatchEvent("click");
  await settled(page);
  expect(opens).toEqual([]);
  release();
  await answered;
  await expect(page).toHaveURL(/\/(todos|health|gym)$/);
  expect(new URL(page.url()).pathname).toBe("/gym");
  await settled(page);
  expect(opens).toEqual(["/gym"]);
});

/**
 * Taps Tasks while a delete is unanswered, then opens the New item form and types a name: doing something else forgets
 * the tap. When the delete answers, the page stays on the Wishlist with the form and its text, and the bar shows the
 * Wishlist again.
 */
async function tapThenType(
  page: Page,
  navigation: string,
  press: (target: Locator) => Promise<void>,
  open: (button: Locator) => Promise<void>,
  type: (field: Locator, text: string) => Promise<void>,
) {
  await openWishlist(page);
  const name = itemName();
  await addItem(page, name);
  const { release, answered } = await holdWrites(page);
  const opens = countOpens(page);
  await press(page.getByRole("button", { name: `Delete ${name}` }));
  await expect(page.getByText(name, { exact: true })).toBeHidden();
  const nav = page.getByRole("navigation", { name: navigation });
  await press(nav.getByRole("link", { name: "Tasks" }));
  await open(page.getByRole("button", { name: "Add item" }));
  const form = page.getByRole("dialog", { name: "New item" });
  const typed = itemName();
  await type(form.getByLabel("Name", { exact: true }), typed);
  const refreshed = page.waitForRequest((r) => isRefresh(page, r));
  release();
  await answered;
  // The refresh after the answer still comes; once it has, a replayed tap would have gone out
  await (await refreshed).response();
  await settled(page);
  expect(opens).toEqual([]);
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue(typed);
  await expect(nav.getByRole("link", { name: "Wishlist" })).toHaveAttribute("aria-current", "page");
}

test("a tap that waits is forgotten once the person taps something else and types [WISH-13]", async ({ signedInPage: page }) => {
  await tapThenType(
    page,
    "Main Navigation",
    (target) => target.click(),
    (button) => button.click(),
    (field, text) => field.fill(text),
  );
});

test("a tap that waits is forgotten once the person presses a key [WISH-13]", async ({ signedInPage: page }) => {
  await tapThenType(
    page,
    "Main Navigation",
    (target) => target.click(),
    async (button) => {
      await button.focus();
      await page.keyboard.press("Enter");
    },
    (field, text) => field.pressSequentially(text),
  );
});

test.describe("at phone width with touch", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("a tap that waits is forgotten once the person taps something else and types [WISH-13]", async ({ signedInPage: page }) => {
    await tapThenType(
      page,
      "Mobile Navigation",
      (target) => target.tap(),
      (button) => button.tap(),
      (field, text) => field.fill(text),
    );
  });
});

// A refresh missed offline drops no copy either: back online, a tap waits for the refresh the server check starts.
test("after a refresh missed offline, a tap waits for the refresh once the server answers [WISH-13]", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openWishlist(page);
  const name = itemName();
  const addRefresh = page.waitForRequest((r) => isRefresh(page, r));
  await addItem(page, name);
  await waitForRefresh(addRefresh);
  await stopClock(page);
  await markPage(page);
  // Each state from now on: the item list with the item or without it while the Wishlist is on screen, else the page
  await page.evaluate((item) => {
    const seen: string[] = [];
    const sample = () => {
      const list = [...document.querySelectorAll("section")].find((s) => /^Items\b/.test(s.querySelector("h2")?.textContent ?? ""));
      if (location.pathname === "/wishlist" && !list) return;
      const state = location.pathname !== "/wishlist" ? location.pathname : list?.textContent?.includes(item) ? "item" : "none";
      if (seen.at(-1) !== state) seen.push(state);
    };
    sample();
    new MutationObserver(sample).observe(document.body, { childList: true, subtree: true, characterData: true });
    Object.assign(window, { seenItems: seen });
  }, name);
  const seen = () => page.evaluate(() => (window as unknown as { seenItems: string[] }).seenItems);
  await andSettle(page, () => page.getByRole("button", { name: `Delete ${name}` }).click());
  await expect(page.getByText(name, { exact: true })).toBeHidden();
  // The device goes offline before the refresh after the answer, which is missed
  const refreshes = countRefreshes(page);
  const setOnline = await network(page);
  await setOnline(false);
  await page.clock.runFor(1000);
  await settled(page);
  expect(refreshes).toHaveLength(0);
  // Back online, the server does not answer the check yet
  let answer = () => {};
  const checked = new Promise<void>((resolve) => (answer = resolve));
  await page.route("**/api/health", async (route) => {
    await checked;
    await route.fallback();
  });
  await setOnline(true);
  await page.clock.runFor(1000);
  // Tasks and back while the check is unanswered: each tap waits, the later one in place of the earlier. Opened now,
  // Tasks and then the Wishlist would come from the copies kept from before the delete, with the item back.
  const nav = page.getByRole("navigation", { name: "Main Navigation" });
  const opens = countOpens(page);
  const refreshed = page.waitForRequest((r) => isRefresh(page, r));
  await nav.getByRole("link", { name: "Tasks" }).click();
  await settled(page);
  expect(opens).toEqual([]);
  await nav.getByRole("link", { name: "Wishlist" }).click();
  await settled(page);
  expect(await seen()).toEqual(["item", "none"]);
  // The server answers: the refresh starts, and the tap goes through (to the page on screen)
  answer();
  await page.clock.resume();
  await refreshed;
  // Tasks and back again, now fetched afresh
  await nav.getByRole("link", { name: "Tasks" }).click();
  await expect(page).toHaveURL(/\/todos$/);
  await nav.getByRole("link", { name: "Wishlist" }).click();
  await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
  await settled(page);
  // The item until the delete, then never again
  expect(await seen()).toEqual(["item", "none", "/todos", "none"]);
  expect(await isKept(page)).toBe(true);
});

test("a tab whose page answer is broken says so [XR-11]", async ({ signedInPage: page }) => {
  await openWishlist(page);
  // The page request of a navigation (not a prefetch) answers HTTP 200 with a body that is no page
  await page.route(
    (url) => url.pathname === "/todos",
    (route) => {
      const headers = route.request().headers();
      if (!("rsc" in headers) || "next-router-prefetch" in headers || "next-router-segment-prefetch" in headers) return route.fallback();
      return route.fulfill({ status: 200, contentType: "text/x-component", body: "<html>not a page</html>" });
    },
  );
  await page.getByRole("link", { name: "Tasks" }).first().click();
  await expect(page.getByText("Couldn't open the page. Try again.")).toBeVisible();
});

test("an edit form open in one tab stays as it is while another tab saves [X-EDIT-DELETED]", async ({ signedInPage: page }) => {
  const name = itemName();
  await openWishlist(page);
  await addItem(page, name);
  const other = await page.context().newPage();
  await openWishlist(other);
  await other.getByRole("button", { name: `Edit ${name}` }).click();
  await other.getByLabel("Name", { exact: true }).fill(`${name} edited`);
  const refreshed = other.waitForResponse((r) => isRefresh(other, r.request()));
  await addItem(page, itemName());
  // The refresh has arrived and React has put it on screen (the commit rebuilds the <head> tags)
  await (await refreshed).finished();
  await other.evaluate(headIsQuiet);
  await expect(other.getByRole("dialog")).toBeVisible();
  await expect(other.getByLabel("Name", { exact: true })).toHaveValue(`${name} edited`);
  await other.close();
});

test("a number field puts the thousand dots in, takes a dot as the decimal and shows an error under it [X-DECIMAL, NUM, X-DOTCOMMA]", async ({
  signedInPage: page,
}) => {
  await page.goto("/health");
  await page.getByRole("button", { name: "Edit today's weight" }).click();
  const form = page.getByRole("dialog", { name: "Edit weight" });
  const field = form.getByLabel("Weight today (kg)");
  await field.pressSequentially("1234.5");
  await expect(field).toHaveValue("1.234,5");
  // A digit typed into "1.234" is not read as a decimal ("1.2340" is twelve thousand, not 1,234)
  await field.fill("");
  await field.pressSequentially("12340");
  await expect(field).toHaveValue("12.340");
  await expect(form.getByRole("alert")).toHaveCount(0);
  // Anything else stays as typed, with the error under the field, and the form does not save
  await field.pressSequentially("x");
  await expect(field).toHaveValue("12.340x");
  await expect(form.getByRole("alert")).toHaveText("Must be a number");
  // It reads like the app's other errors, not like the label it sits in
  await expect(form.getByRole("alert")).toHaveCSS("font-weight", "400");
  await expect(form.getByRole("alert")).toHaveCSS("font-size", "14px");
  await expect(field).toHaveAccessibleName("Weight today (kg)");
  const writes: Request[] = [];
  page.on("request", (r) => r.method() === "POST" && "next-action" in r.headers() && writes.push(r));
  await form.getByRole("button", { name: "Save" }).click();
  await settled(page);
  expect(writes).toHaveLength(0);
  await expect(form).toBeVisible();
});

test("a restore that fails keeps a Retry, which restores [XR-08]", async ({ signedInPage: page }) => {
  const name = itemName();
  await openWishlist(page);
  await addItem(page, name);
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await andSettle(page, () => page.getByRole("button", { name: `Delete ${name}` }).click());
  await expect(page.getByText(name, { exact: true })).toBeHidden();
  // The restore's answer is a server error
  await page.route("**/wishlist", (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "text/plain", body: "boom" }) : route.fallback(),
  );
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Failed to restore item")).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeHidden();
  await page.unroute("**/wishlist");
  await andSettle(page, () => page.getByRole("button", { name: "Retry" }).click());
  await expect(page.getByText(name, { exact: true })).toBeVisible();
});
