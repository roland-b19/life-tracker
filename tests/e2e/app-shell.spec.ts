import { randomUUID } from "node:crypto";
import { expect, type Page, type Request } from "@playwright/test";
import { andSettle, headIsQuiet, isRefresh, settled, test } from "./helpers";

// The app shell (app/providers.tsx): open copies stay in sync, writes without an answer say why, midnight moves the
// page to the new day, a broken page answer says so, and the Undo toasts keep a Retry for a failed restore.
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

test("a refresh that comes due while offline runs once when the device is back online", async ({ signedInPage: page, browser }) => {
  const name = itemName();
  const context = await browser.newContext();
  await context.addCookies(await page.context().cookies());
  const other = await context.newPage();
  try {
    await page.clock.install();
    await openWishlist(page);
    // Another browser saves an item; this page hears nothing of it until it refreshes
    await openWishlist(other);
    await addItem(other, name);
    // A page load would drop this mark
    await page.evaluate(() => ((window as unknown as { kept: boolean }).kept = true));
    const refreshes = countRefreshes(page);
    await page.context().setOffline(true);
    try {
      // Past the 60 s refresh of an open page, which comes due while offline
      await page.clock.runFor(61_000);
      await settled(page);
      expect(refreshes).toHaveLength(0);
      // The page hears "online" before Playwright has put every part of its network back, so the page's timers wait
      // (a refresh sent in that gap fails and Next falls back to a page load) and run only once it is back
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
    } finally {
      await page.context().setOffline(false);
    }
    await page.clock.runFor(100);
    // The Wishlist keeps its rows in a plain useState until it takes useServerState (audit fixes step 19), so the new
    // data is checked in the refresh's answer, the page payload the router puts on screen
    await expect.poll(() => refreshes.length).toBe(1);
    const answer = await refreshes[0].response();
    expect(await answer?.text()).toContain(name);
    // Once only, and without a page load
    await page.clock.runFor(2000);
    await settled(page);
    expect(refreshes).toHaveLength(1);
    expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true);
  } finally {
    await context.close();
  }
});

test("coming back online with no refresh due refreshes nothing", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openWishlist(page);
  const refreshes = countRefreshes(page);
  await page.context().setOffline(true);
  await settled(page);
  await page.context().setOffline(false);
  // Past the 600 ms a refresh could wait, and still before the 60 s refresh of an open page
  await page.clock.runFor(2000);
  await settled(page);
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
