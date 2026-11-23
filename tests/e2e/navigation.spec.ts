import { expect, type Page, type Route } from "@playwright/test";
import { CONTROL, EDGE_PX } from "../../app/components/edge-swipe";
import {
  appearance,
  deleteDevUsers,
  devUserCount,
  devUserName,
  expectNoSeriousViolations,
  installStoppedClock,
  newDevice,
  signInThroughForm,
  test,
  theme,
} from "./helpers";

// The app shell: tab bar, More menu, sidebar, the 404 page and the listeners every page has (D-035, MORE-03, MORE-06,
// MORE-11, XR-11), and the sign-in form. The phone pieces are hidden from 1024px, so the flows set a phone width themselves.
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
  const context = await newDevice(browser, signedInPage, { hasTouch: true, viewport: PHONE });
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
  // The card, found by what it holds rather than by its class: the outermost element in the dialog that holds its title
  // (the dialog itself is the full-screen backdrop around it)
  const card = page.getByRole("dialog", { name: "New item" }).locator("*").filter({ has: page.getByRole("heading", { name: "New item" }) }).first();
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
  const name = `${devUserName()}-${"a".repeat(52)}`;
  expect(name).toHaveLength(65);
  // Neither the name nor the name cut to 64 characters gets a user row
  const names = [name, name.slice(0, 64)];
  try {
    // As soon as the form takes typing (it waits for its session check, so nothing typed is lost)
    await page.goto("/signin", { waitUntil: "commit" });
    const field = page.getByLabel("Username");
    await field.fill(name);
    await expect(field).toHaveValue(name);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Please enter a username of up to 64 lower-case letters, numbers or dashes")).toBeVisible();
    await expect(page).toHaveURL(/\/signin$/);
    expect(await devUserCount(...names)).toBe(0);
  } finally {
    await deleteDevUsers(...names);
  }
});

// The signed-in shell shows: a refused sign-in would bounce back to /signin.
const shellShows = (page: Page) => expect(page.getByRole("button", { name: "Sign out" }).first()).toBeAttached();

test("a fresh browser signs in through the form as the name typed, pressing Continue as soon as it can [SIGNIN]", async ({ page }) => {
  await signInThroughForm(page, "/signin", shellShows);
});

test("a sign-in whose CSRF token was refused is tried once more, and a second refusal is shown, not taken for a session [SIGNIN]", async ({
  page,
}) => {
  // NextAuth's answer to a token that does not match its cookie
  const refuse = (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: new URL("/api/auth/signin?csrf=true", route.request().url()).href }) });
  const callback = "**/api/auth/callback/credentials";
  // The first answer refuses the token: the form tries again and signs in
  await page.route(callback, refuse, { times: 1 });
  await signInThroughForm(page, "/signin", shellShows);

  // Every answer refuses it: the form says so and stays
  await page.context().clearCookies();
  await page.route(callback, refuse);
  await page.goto("/signin");
  await page.getByLabel("Username").fill(devUserName());
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Failed to sign in")).toBeVisible();
  await expect(page).toHaveURL(/\/signin$/);
});

test("a session check that never answers stops holding the sign-in form after 5 s; the sign-in then waits for its own session call [SIGNIN]", async ({
  page,
}) => {
  const name = devUserName();
  const session = "**/api/auth/session";
  // Every session call is held, unanswered, until `hold` is turned off
  const held: Route[] = [];
  let hold = true;
  try {
    // Paused from the start: only runFor moves the time, however long the page takes to load
    await installStoppedClock(page, Date.parse("2026-11-20T12:00:00Z"));
    await page.route(session, (route) => (hold ? void held.push(route) : route.continue()));
    await page.goto("/signin", { waitUntil: "commit" });
    // The page's session check has gone out: the form is hydrated and its timer runs
    await expect.poll(() => held.length).toBeGreaterThan(0);
    const field = page.getByLabel("Username");
    const proceed = page.getByRole("button", { name: "Continue" });

    await page.clock.runFor(4_900);
    await expect(proceed).toBeDisabled();
    await expect(field).not.toBeEditable();
    await page.clock.runFor(100);
    await expect(proceed).toBeEnabled();
    await expect(field).toBeEditable();
    await page.clock.resume();

    // The server signs the typed name in, but NextAuth's signIn answers only after its own session call, held too: the
    // form stays on "Signing in..." and never takes the page anywhere without it
    await field.fill(name);
    const before = held.length;
    const callback = page.waitForResponse("**/api/auth/callback/credentials");
    await proceed.click();
    expect((await callback).ok()).toBe(true);
    await expect.poll(() => held.length).toBeGreaterThan(before);
    expect(await devUserCount(name)).toBe(1);
    await expect(page.getByRole("button", { name: "Signing in..." })).toBeDisabled();
    await expect(page).toHaveURL(/\/signin$/);

    // Once the session calls answer, the sign-in finishes as the typed name
    hold = false;
    for (const route of held.splice(0)) await route.continue();
    await shellShows(page);
    await expect(page).toHaveURL(/\/todos$/);
  } finally {
    await deleteDevUsers(name);
  }
});

// installStoppedClock stops the clock where it stands, as pauseClock does, not at a fixed second after `time`: a page
// whose main thread is busy for 2 s right after the install (install wrapped here to make it so) answers the pause late,
// past that second.
test("a stopped clock installed while the page is busy stands still, however late the page answers", async ({ page }) => {
  // The page's own clock, kept from before the install, times the busy spell
  await page.evaluate(() => Object.assign(window, { realNow: performance.now.bind(performance) }));
  const install = page.clock.install.bind(page.clock);
  page.clock.install = async (options) => {
    await install(options);
    await page.evaluate(() => {
      const realNow = (window as unknown as { realNow: () => number }).realNow;
      const end = realNow() + 2_000;
      while (realNow() < end);
    });
  };
  const time = Date.parse("2026-11-20T12:00:00Z");
  await installStoppedClock(page, time);
  // Read twice, 100 ms apart by the page's own clock: the same time
  const twice = await page.evaluate(() => {
    const realNow = (window as unknown as { realNow: () => number }).realNow;
    const first = Date.now();
    const end = realNow() + 100;
    while (realNow() < end);
    return [first, Date.now()];
  });
  expect(twice[0]).toBeGreaterThan(time + 1_000);
  expect(twice[1]).toBe(twice[0]);
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

test("a theme picked in Settings applies in the other open tabs of the same browser, with no reload (MORE-06, D-047)", async ({ signedInPage: page }) => {
  const tasks = await page.context().newPage();
  const settings = await page.context().newPage();
  await tasks.goto("/todos");
  await settings.goto("/settings");
  await page.goto("/settings");
  // A page load would drop these marks
  for (const other of [tasks, settings]) await other.evaluate(() => ((window as unknown as { kept: boolean }).kept = true));

  await appearance(page).getByRole("tab", { name: "Dark", exact: true }).click();
  await expect.poll(() => theme(tasks)).toBe("dark");
  await expect.poll(() => theme(settings)).toBe("dark");
  await expect(appearance(settings).getByRole("tab", { name: "Dark", exact: true })).toHaveAttribute("aria-selected", "true");

  await appearance(page).getByRole("tab", { name: "Auto", exact: true }).click();
  await expect.poll(() => theme(tasks)).toBe("auto");
  await expect(appearance(settings).getByRole("tab", { name: "Auto", exact: true })).toHaveAttribute("aria-selected", "true");
  for (const other of [tasks, settings]) expect(await other.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true);
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
