import { randomUUID } from "node:crypto";
import { expect, type Page, type Request } from "@playwright/test";
import { andSettle, isRefresh, test } from "./helpers";

// The app shell (app/providers.tsx): open copies stay in sync, writes without an answer say why, midnight moves the
// page to the new day, a broken page answer says so, and the Undo toasts keep a Retry for a failed restore.

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
  const refreshed = other.waitForRequest((r) => isRefresh(other, r), { timeout: 2000 });
  await addItem(page, itemName());
  await refreshed;
  await other.close();
});

test("another browser refreshes when it gets the focus back [SYNC]", async ({ signedInPage: page, browser }) => {
  const context = await browser.newContext();
  await context.addCookies(await page.context().cookies());
  const other = await context.newPage();
  try {
    await openWishlist(other);
    await openWishlist(page);
    const refreshes = countRefreshes(other);
    await addItem(page, itemName());
    // Another browser hears nothing of the write: only its focus refreshes it (two seconds after its last load)
    await other.waitForTimeout(2000);
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
  await page.clock.fastForward(20_000);
  await page.waitForTimeout(1000);
  expect(refreshes).toHaveLength(0);
  await page.clock.fastForward(20_000);
  await expect.poll(() => refreshes.length).toBe(1);
  await page.waitForTimeout(1500);
  expect(refreshes).toHaveLength(1);
});

test("a write while offline says nothing was saved and leaves the form open [X-OFFLINE, PROD-01, XR-01]", async ({ signedInPage: page }) => {
  await openWishlist(page);
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Name", { exact: true }).fill(itemName());
  await page.getByLabel("Price (RON)").fill("100");
  const refreshes = countRefreshes(page);
  await page.context().setOffline(true);
  try {
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("You're offline. Nothing was saved.")).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(1000);
    expect(refreshes).toHaveLength(0);
  } finally {
    await page.context().setOffline(false);
  }
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
  const refreshed = other.waitForRequest((r) => isRefresh(other, r), { timeout: 2000 });
  await addItem(page, itemName());
  await refreshed;
  await other.waitForTimeout(500);
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
  await expect(field).toHaveAccessibleName("Weight today (kg)");
  const writes: Request[] = [];
  page.on("request", (r) => r.method() === "POST" && "next-action" in r.headers() && writes.push(r));
  await form.getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(500);
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
