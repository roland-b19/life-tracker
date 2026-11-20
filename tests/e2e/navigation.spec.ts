import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { CONTROL, EDGE_PX } from "../../app/components/edge-swipe";
import { expectNoSeriousViolations, test } from "./helpers";

// The app shell: tab bar, More menu, sidebar, the 404 page and the listeners every page has (D-035, MORE-03, MORE-06,
// MORE-11, XR-11). The phone pieces are hidden from 1024px, so the flows set a phone width themselves.
const PHONE = { width: 375, height: 812 };

const tabBar = (page: Page) => page.getByRole("navigation", { name: "Mobile Navigation" });
const moreMenu = (page: Page) => page.getByRole("dialog", { name: "More" });
const historyLength = (page: Page) => page.evaluate(() => history.length);
const focusInMenu = (page: Page) => page.evaluate(() => !!document.activeElement?.closest("#more-menu"));

/** A promise and the function that resolves it. */
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Whether the edge guard cancels a touch that starts at (x, y) on whatever is drawn there. */
const touchCancelled = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([clientX, clientY]) => {
      const target = document.elementFromPoint(clientX, clientY)!;
      const touch = new Touch({ identifier: 1, target, clientX, clientY });
      const event = new TouchEvent("touchstart", { touches: [touch], changedTouches: [touch], bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    },
    [x, y],
  );

test("the tab bar, the More menu and the sidebar replace the history entry: there is no Back to walk (SWIPE)", async ({ signedInPage: page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/todos");
  const before = await historyLength(page);

  for (const [label, path] of [["Gym", "/gym"], ["Health", "/health"], ["Wishlist", "/wishlist"], ["Tasks", "/todos"]]) {
    await tabBar(page).getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
  await tabBar(page).getByRole("button", { name: "More" }).click();
  await moreMenu(page).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  expect(await historyLength(page)).toBe(before);

  await page.setViewportSize({ width: 1280, height: 800 });
  const sidebar = page.getByRole("navigation", { name: "Main Navigation" });
  for (const [label, path] of [["Gym", "/gym"], ["Tasks", "/todos"]]) {
    await sidebar.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
  expect(await historyLength(page)).toBe(before);
});

test("a touch that starts within 20px of the left or right edge is cancelled, one further in is not (SWIPE)", async ({ signedInPage: page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/todos");
  await expect(tabBar(page)).toBeVisible();
  const cancelled = (x: number) =>
    page.evaluate((clientX) => {
      const target = document.body;
      const touch = new Touch({ identifier: 1, target, clientX, clientY: 300 });
      const event = new TouchEvent("touchstart", { touches: [touch], changedTouches: [touch], bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    }, x);
  expect(await cancelled(5)).toBe(true);
  expect(await cancelled(19)).toBe(true);
  expect(await cancelled(PHONE.width - 10)).toBe(true);
  expect(await cancelled(25)).toBe(false);
  expect(await cancelled(PHONE.width / 2)).toBe(false);
});

test("a tap on the outer pixels of a control at the edge still works; the edge background stays cancelled (SWIPE)", async ({ signedInPage, browser }) => {
  // A touch screen of its own, signed in as the fixture's user.
  const context = await browser.newContext({
    storageState: await signedInPage.context().storageState(),
    hasTouch: true,
    viewport: PHONE,
  });
  const page = await context.newPage();
  try {
    await page.goto(new URL("/todos", signedInPage.url()).href);
    const edgeTap = async (label: string, role: "link" | "button", side: "left" | "right") => {
      const box = (await tabBar(page).getByRole(role, { name: label }).boundingBox())!;
      const x = side === "left" ? box.x + 2 : box.x + box.width - 2;
      expect(side === "left" ? x < 20 : x > PHONE.width - 20).toBe(true);
      await page.touchscreen.tap(x, box.y + box.height / 2);
    };

    await edgeTap("Gym", "link", "left");
    await expect(page).toHaveURL(/\/gym$/);
    await edgeTap("More", "button", "right");
    await expect(moreMenu(page)).toBeVisible();
    await page.keyboard.press("Escape");

    expect(await page.evaluate((control) => !!document.elementFromPoint(5, 300)!.closest(control), CONTROL)).toBe(false);
    expect(await touchCancelled(page, 5, 300)).toBe(true);
  } finally {
    await context.close();
  }
});

test("the outer pixels of the open modal card and More menu at the edge are guarded; a button there is not (SWIPE)", async ({
  signedInPage: page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto("/wishlist");
  // A touch on the tab bar's More button at the right edge goes through, so its tap works
  const more = (await tabBar(page).getByRole("button", { name: "More" }).boundingBox())!;
  const moreEdge = Math.floor(more.x + more.width) - 2;
  expect(moreEdge).toBeGreaterThan(PHONE.width - EDGE_PX);
  expect(await touchCancelled(page, moreEdge, more.y + more.height / 2)).toBe(false);

  // The modal card and the More menu take focus by script only (tabIndex -1), so they are no control: their edge pixels
  // inside the zone are guarded
  const edgePixels = async (box: { x: number; y: number; width: number; height: number }) => {
    const left = Math.ceil(box.x) + 1;
    const right = Math.floor(box.x + box.width) - 2;
    expect(left).toBeLessThan(EDGE_PX);
    expect(right).toBeGreaterThan(PHONE.width - EDGE_PX);
    for (const x of [left, right]) expect(await touchCancelled(page, x, box.y + box.height / 2)).toBe(true);
  };
  await page.getByRole("button", { name: "Add item" }).click();
  const card = page.locator(".modal-card");
  await expect(card).toBeVisible();
  await edgePixels((await card.boundingBox())!);
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();

  await tabBar(page).getByRole("button", { name: "More" }).click();
  await expect(moreMenu(page)).toBeVisible();
  await edgePixels((await moreMenu(page).boundingBox())!);
});

test("a tab whose page cannot be opened leaves the tab bar on the page on screen [XR-11]", async ({ signedInPage: page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/wishlist");
  await expect(tabBar(page).getByRole("link", { name: "Wishlist" })).toHaveAttribute("aria-current", "page");
  // The page request of the navigation (not a prefetch) answers HTTP 200 with a body that is no page: Next stays put.
  // (A 500 or a failed request makes Next load the page in full instead, so the bar and the page agree.)
  await page.route(
    (url) => url.pathname === "/todos",
    (route) => {
      const headers = route.request().headers();
      if (!("rsc" in headers) || "next-router-prefetch" in headers || "next-router-segment-prefetch" in headers) return route.fallback();
      return route.fulfill({ status: 200, contentType: "text/x-component", body: "<html>not a page</html>" });
    },
  );
  await tabBar(page).getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByText("Couldn't open the page. Try again.")).toBeVisible();
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(tabBar(page).getByRole("link", { name: "Wishlist" })).toHaveAttribute("aria-current", "page");
  await expect(tabBar(page).getByRole("link", { name: "Tasks" })).not.toHaveAttribute("aria-current", "page");
});

test("a page that cannot be opened after another tab was pressed leaves the bar on the page still loading [XR-11]", async ({
  signedInPage: page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto("/wishlist");
  await expect(tabBar(page).getByRole("link", { name: "Wishlist" })).toHaveAttribute("aria-current", "page");
  // The page requests of Tasks (a body that is no page) and Gym (the real page) wait until the test lets them go
  const todos = gate();
  const gym = gate();
  const arrived = { todos: gate(), gym: gate() };
  for (const [path, release, arrive] of [
    ["/todos", todos, arrived.todos],
    ["/gym", gym, arrived.gym],
  ] as const) {
    await page.route(
      (url) => url.pathname === path,
      async (route) => {
        const headers = route.request().headers();
        if (!("rsc" in headers) || "next-router-prefetch" in headers || "next-router-segment-prefetch" in headers) return route.fallback();
        arrive.resolve();
        await release.promise;
        return path === "/todos"
          ? route.fulfill({ status: 200, contentType: "text/x-component", body: "<html>not a page</html>" })
          : route.fallback();
      },
    );
  }
  await tabBar(page).getByRole("link", { name: "Tasks" }).click();
  await arrived.todos.promise;
  await tabBar(page).getByRole("link", { name: "Gym" }).click();
  await arrived.gym.promise;
  await expect(tabBar(page).getByRole("link", { name: "Gym" })).toHaveAttribute("aria-current", "page");
  // Tasks fails while Gym is still loading: the bar stays on Gym, not on the page on screen
  todos.resolve();
  await expect(page.getByText("Couldn't open the page. Try again.")).toBeVisible();
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(tabBar(page).getByRole("link", { name: "Gym" })).toHaveAttribute("aria-current", "page");
  await expect(tabBar(page).getByRole("link", { name: "Wishlist" })).not.toHaveAttribute("aria-current", "page");
  gym.resolve();
  await expect(page).toHaveURL(/\/gym$/);
  await expect(tabBar(page).getByRole("link", { name: "Gym" })).toHaveAttribute("aria-current", "page");
});

test("a dev user name longer than 64 characters is refused with the message, not cut short (MORE-12)", async ({ page }) => {
  // 65 characters, new on each run
  const name = `e2e-${randomUUID().slice(0, 8)}-${"a".repeat(52)}`;
  expect(name).toHaveLength(65);
  // Neither the name nor the name cut to 64 characters gets a user row
  const names = [name, name.slice(0, 64)];
  const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
  try {
    // The page's own session calls each set a CSRF cookie when there is none, so a click before they end could post a
    // stale token (see helpers.ts). With the cookie set first they keep it, and the form's token always matches.
    expect((await page.request.get("/api/auth/csrf")).ok()).toBe(true);
    await page.goto("/signin");
    const field = page.getByLabel("Username");
    await field.fill(name);
    await expect(field).toHaveValue(name);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Please enter a username of up to 64 lower-case letters, numbers or dashes.")).toBeVisible();
    await expect(page).toHaveURL(/\/signin/);
    const rows = await admin.query("SELECT 1 FROM users WHERE issuer = 'dev' AND subject = ANY($1)", [names]);
    expect(rows.rowCount).toBe(0);
  } finally {
    try {
      await admin.query("DELETE FROM users WHERE issuer = 'dev' AND subject = ANY($1)", [names]);
    } finally {
      await admin.end();
    }
  }
});

test("the phone More menu is a modal dialog: focus moves in, stays in, and returns to More (MORE-03)", async ({ signedInPage: page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/todos");
  const more = tabBar(page).getByRole("button", { name: "More" });

  await more.click();
  await expect(moreMenu(page)).toHaveAttribute("aria-modal", "true");
  expect(await focusInMenu(page)).toBe(true);
  // Sign out, Close and Settings: Tab and Shift+Tab go round them and never leave the menu.
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await focusInMenu(page)).toBe(true);
  }
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await focusInMenu(page)).toBe(true);
  }
  // The Settings link, styled as a button, gets the buttons' 2px keyboard ring.
  const settings = moreMenu(page).getByRole("link", { name: "Settings" });
  while (!(await settings.evaluate((el) => el === document.activeElement))) await page.keyboard.press("Tab");
  await expect(settings).toHaveCSS("outline-style", "solid");
  await expect(settings).toHaveCSS("outline-width", "2px");
  await page.keyboard.press("Escape");
  await expect(moreMenu(page)).toBeHidden();
  await expect(more).toBeFocused();

  await more.click();
  await moreMenu(page).getByRole("button", { name: "Close menu" }).click();
  await expect(moreMenu(page)).toBeHidden();
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute("aria-expanded", "false");
});

test("a signed-in 404 keeps the navigation; a signed-out one is a card of its own (MORE-11)", async ({ signedInPage: page, browser }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main Navigation" })).toBeVisible();
  await page.getByRole("navigation", { name: "Main Navigation" }).getByRole("link", { name: "Tasks" }).click();
  await expect(page).toHaveURL(/\/todos$/);

  const anonymous = await browser.newPage();
  try {
    await anonymous.goto(new URL("/no-such-page", page.url()).href);
    await expect(anonymous.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(anonymous.getByRole("navigation", { name: "Main Navigation" })).toHaveCount(0);
    await expect(anonymous.getByRole("link", { name: "Go to the start page" })).toBeVisible();
  } finally {
    await anonymous.close();
  }
});

test("a theme picked in Settings applies in the other open tabs of the same browser (MORE-06)", async ({ signedInPage: page }) => {
  const theme = (p: Page) => p.evaluate(() => document.documentElement.dataset.theme ?? "auto");
  const tasks = await page.context().newPage();
  const settings = await page.context().newPage();
  await tasks.goto("/todos");
  await settings.goto("/settings");
  await page.goto("/settings");
  const appearance = (p: Page) => p.getByRole("region", { name: "Appearance", exact: true });

  await appearance(page).getByRole("tab", { name: "Dark", exact: true }).click();
  await expect.poll(() => theme(tasks)).toBe("dark");
  await expect.poll(() => theme(settings)).toBe("dark");
  await expect(appearance(settings).getByRole("tab", { name: "Dark", exact: true })).toHaveAttribute("aria-selected", "true");

  await appearance(page).getByRole("tab", { name: "Auto", exact: true }).click();
  await expect.poll(() => theme(tasks)).toBe("auto");
  await expect(appearance(settings).getByRole("tab", { name: "Auto", exact: true })).toHaveAttribute("aria-selected", "true");
  await tasks.close();
  await settings.close();
});

test("the 404 page and the open More menu have no serious violations", { tag: "@a11y" }, async ({ signedInPage: page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expectNoSeriousViolations(page);
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await tabBar(page).getByRole("button", { name: "More" }).click();
    await expect(moreMenu(page)).toBeVisible();
    await expectNoSeriousViolations(page);
  }
});
