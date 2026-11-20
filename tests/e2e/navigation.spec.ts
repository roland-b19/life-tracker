import { expect, type Page } from "@playwright/test";
import { expectNoSeriousViolations, test } from "./helpers";

// The app shell: tab bar, More menu, sidebar, the 404 page and the listeners every page has (D-035, MORE-03, MORE-06,
// MORE-11). The phone pieces are hidden from 1024px, so the flows set a phone width themselves.
const PHONE = { width: 375, height: 812 };

const tabBar = (page: Page) => page.getByRole("navigation", { name: "Mobile Navigation" });
const moreMenu = (page: Page) => page.getByRole("dialog", { name: "More" });
const historyLength = (page: Page) => page.evaluate(() => history.length);
const focusInMenu = (page: Page) => page.evaluate(() => !!document.activeElement?.closest("#more-menu"));

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

    const backgroundCancelled = await page.evaluate(() => {
      const target = document.elementFromPoint(5, 300)!;
      if (target.closest("a, button, input, select, textarea, label, summary, [role=button], [role=tab], [tabindex]")) {
        return "control";
      }
      const touch = new Touch({ identifier: 1, target, clientX: 5, clientY: 300 });
      const event = new TouchEvent("touchstart", { touches: [touch], changedTouches: [touch], bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(backgroundCancelled).toBe(true);
  } finally {
    await context.close();
  }
});

test("a dev user name longer than 64 characters is refused with the message, not cut short (MORE-12)", async ({ page }) => {
  await page.goto("/signin");
  // The page's own session calls set the CSRF cookie; a click before they settle posts a stale token (see helpers.ts).
  await page.waitForLoadState("networkidle");
  const field = page.getByLabel("Username");
  await field.fill(`e2e-${"a".repeat(61)}`);
  await expect(field).toHaveValue(`e2e-${"a".repeat(61)}`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Please enter a username of up to 64 lower-case letters, numbers or dashes.")).toBeVisible();
  await expect(page).toHaveURL(/\/signin/);
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
