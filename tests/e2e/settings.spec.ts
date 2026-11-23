import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import {
  andSettle,
  appearance,
  asOwner,
  center,
  dismissToast,
  expectNoSeriousViolations,
  expectToastWithoutUndo,
  hydrationWarnings,
  pauseClock,
  signInThroughForm,
  test,
  theme,
  undoIn,
  writesIn,
} from "./helpers";

const claudeCard = (page: Page) => page.getByRole("region", { name: "Claude", exact: true });

async function openSettings(page: Page) {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(claudeCard(page)).toBeVisible();
}

// A throwaway value in the shape the form accepts (`sk-ant-` and at least 20 more characters). It is only stored, encrypted
// with the e2e key, and never sent to Claude, so no real token is ever needed or typed.
const fakeToken = () => `sk-ant-e2e-${randomUUID().replaceAll("-", "")}`;

// Fills the token form that is open (its title is "Connect Claude" or "Edit token") and saves it through `andSettle`.
async function saveToken(page: Page, dialogName: "Connect Claude" | "Edit token", token: string) {
  const form = page.getByRole("dialog", { name: dialogName });
  await form.getByLabel("Token").fill(token);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form).toBeHidden();
}

async function connect(page: Page, token: string) {
  await claudeCard(page).getByRole("button", { name: "Connect Claude" }).click();
  await saveToken(page, "Connect Claude", token);
  await expect(page.getByText("Connected Claude")).toBeVisible();
}

const notConnected = (page: Page) => claudeCard(page).getByText("Not connected.");
const account = (page: Page) => claudeCard(page).getByText("Claude account", { exact: true });

// Tests tagged @a11y run on every project (desktop and phone width, dark and light); the rest run on desktop only, because only the
// axe scan depends on the width and the color scheme (see playwright.config.ts).
test("the Settings page has no serious violations, also with the connect form open and when connected", { tag: "@a11y" }, async ({ signedInPage: page }) => {
  await openSettings(page);
  await expect(notConnected(page)).toBeVisible();
  await expectNoSeriousViolations(page);

  await claudeCard(page).getByRole("button", { name: "Connect Claude" }).click();
  await expect(page.getByRole("dialog", { name: "Connect Claude" })).toBeVisible();
  await expectNoSeriousViolations(page);

  await saveToken(page, "Connect Claude", fakeToken());
  await expect(account(page)).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("a signed-in user connects Claude, with a refusal for a bad token and Undo, also after a reload", async ({ signedInPage: page }) => {
  // The sidebar always links to Settings; the Claude card on it needs the Claude flag (the e2e server sets it).
  await page.goto("/health");
  await page.getByRole("navigation", { name: "Main Navigation" }).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(notConnected(page)).toBeVisible();

  // A token that is not in the shape `claude setup-token` prints is refused, and the message stays in the form.
  await claudeCard(page).getByRole("button", { name: "Connect Claude" }).click();
  const form = page.getByRole("dialog", { name: "Connect Claude" });
  await form.getByLabel("Token").fill("not-a-token");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form.getByRole("alert")).toHaveText("Please paste the token that claude setup-token prints");
  await expect(notConnected(page)).toBeVisible();

  // The same form takes a valid one.
  await saveToken(page, "Connect Claude", fakeToken());
  await expect(page.getByText("Connected Claude")).toBeVisible();
  await expect(account(page)).toBeVisible();
  await expect(claudeCard(page).getByText(/^Connected \d/)).toBeVisible();

  // Undo disconnects again, also after a reload.
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(notConnected(page)).toBeVisible();
  await openSettings(page);
  await expect(notConnected(page)).toBeVisible();

  // Connect again: the database keeps it across a reload.
  await connect(page, fakeToken());
  await openSettings(page);
  await expect(account(page)).toBeVisible();
});

test("a signed-in user replaces the token and disconnects, with Undo for each, also after a reload", async ({ signedInPage: page }) => {
  await openSettings(page);
  await connect(page, fakeToken());
  await dismissToast(page, "Connected Claude");

  // Replace: the form is titled "Edit token"; Undo puts the earlier token back, so the account stays connected.
  await claudeCard(page).getByRole("button", { name: "Replace the Claude token" }).click();
  await saveToken(page, "Edit token", fakeToken());
  await expect(page.getByText("Saved the new Claude token")).toBeVisible();
  await expect(account(page)).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(account(page)).toBeVisible();
  await openSettings(page);
  await expect(account(page)).toBeVisible();

  // Disconnect: the database keeps it across a reload (a reload also drops the toast, so this round has no Undo).
  await andSettle(page, () => claudeCard(page).getByRole("button", { name: "Disconnect Claude" }).click());
  await expect(page.getByText("Disconnected Claude")).toBeVisible();
  await expect(notConnected(page)).toBeVisible();
  await openSettings(page);
  await expect(notConnected(page)).toBeVisible();

  // Connect again, disconnect, then Undo: the account comes back, also after a reload.
  await connect(page, fakeToken());
  await dismissToast(page, "Connected Claude");
  await andSettle(page, () => claudeCard(page).getByRole("button", { name: "Disconnect Claude" }).click());
  await expect(notConnected(page)).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(account(page)).toBeVisible();
  await openSettings(page);
  await expect(account(page)).toBeVisible();
});

// The page color is the background of <html> (app/globals.css), a light-dark() token. A change of mode fades it while
// data-theme-fade is set (D-025), so it is read once the fade is over; read before the fade starts, it is already final.
async function pageColor(page: Page) {
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-fade");
  return page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
}

async function pick(page: Page, choice: "Auto" | "Light" | "Dark") {
  await appearance(page).getByRole("tab", { name: choice, exact: true }).click();
  await expect(appearance(page).getByRole("tab", { name: choice, exact: true })).toHaveAttribute("aria-selected", "true");
}

test("a signed-in user picks Light or Dark for this device, with Undo, also after a reload", async ({ signedInPage: page }) => {
  // The script in <head> changes <html> before React hydrates; React must not warn about either (InlineScript).
  const reactWarnings = hydrationWarnings(page);

  await openSettings(page);
  await expect(appearance(page).getByRole("tab", { name: "Auto", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await theme(page)).toBe("auto");
  const dark = await pageColor(page); // this project's system scheme is dark
  await page.emulateMedia({ colorScheme: "light" });
  const light = await pageColor(page);
  expect(light).not.toBe(dark);

  // Light against a dark system; Undo puts Auto back, and the page follows the system again.
  await page.emulateMedia({ colorScheme: "dark" });
  await pick(page, "Light");
  await expect(page.getByText("Appearance set to Light")).toBeVisible();
  expect(await theme(page)).toBe("light");
  expect(await pageColor(page)).toBe(light);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(appearance(page).getByRole("tab", { name: "Auto", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await theme(page)).toBe("auto");
  expect(await pageColor(page)).toBe(dark);
  await openSettings(page);
  expect(await theme(page)).toBe("auto");

  // Light is kept across a reload.
  await pick(page, "Light");
  await openSettings(page);
  await expect(appearance(page).getByRole("tab", { name: "Light", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await theme(page)).toBe("light");
  expect(await pageColor(page)).toBe(light);

  // Dark against a light system, also after a reload; then Auto follows the light system.
  await page.emulateMedia({ colorScheme: "light" });
  await pick(page, "Dark");
  expect(await pageColor(page)).toBe(dark);
  await openSettings(page);
  await expect(appearance(page).getByRole("tab", { name: "Dark", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await theme(page)).toBe("dark");
  expect(await pageColor(page)).toBe(dark);
  await pick(page, "Auto");
  expect(await theme(page)).toBe("auto");
  expect(await pageColor(page)).toBe(light);

  // A change of mode fades the colors (data-theme-fade, set right before the new data-theme), but not with reduced motion.
  const pickFades = (choice: "Dark" | "Light") =>
    appearance(page)
      .getByRole("tab", { name: choice, exact: true })
      .evaluate(
        (tab: HTMLElement, mode) =>
          new Promise<boolean>((resolve) => {
            const root = document.documentElement;
            new MutationObserver((_, observer) => {
              if (root.dataset.theme !== mode) return;
              observer.disconnect();
              resolve("themeFade" in root.dataset);
            }).observe(root, { attributeFilter: ["data-theme"] });
            tab.click();
          }),
        choice.toLowerCase(),
      );
  expect(await pickFades("Dark")).toBe(true);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-fade");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await pickFades("Light")).toBe(false);

  expect(reactWarnings).toEqual([]);
});

test("a second theme change takes the first toast's Undo away; its own Undo puts the first change back [D-040, D-047]", async ({ signedInPage: page }) => {
  await page.clock.install();
  await openSettings(page);
  await pauseClock(page);
  await pick(page, "Dark");
  await expect(undoIn(page, "Appearance set to Dark")).toBeVisible();
  await pick(page, "Light");
  await expectToastWithoutUndo(page, "Appearance set to Dark");
  await undoIn(page, "Appearance set to Light").click();
  await expect(appearance(page).getByRole("tab", { name: "Dark", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await theme(page)).toBe("dark");
});

test("a theme kept before D-047 (a raw light or dark) still applies and is kept as JSON from then on; an unreadable one is Auto", async ({ signedInPage: page }) => {
  const stored = () => page.evaluate(() => localStorage.getItem("lt-theme"));
  await openSettings(page);
  await page.evaluate(() => localStorage.setItem("lt-theme", "light"));
  await openSettings(page);
  expect(await theme(page)).toBe("light");
  await expect(appearance(page).getByRole("tab", { name: "Light", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await stored()).toBe(JSON.stringify("light"));

  await page.evaluate(() => localStorage.setItem("lt-theme", "{not json"));
  await openSettings(page);
  expect(await theme(page)).toBe("auto");
  await expect(appearance(page).getByRole("tab", { name: "Auto", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("a signed-out visit to /settings comes back to /settings after sign-in, and the connect date is the app's day [PATH, MORE-02]", async ({ page }) => {
  await signInThroughForm(
    page,
    "/settings",
    (page) => connect(page, fakeToken()),
    async (name) => {
      // 22:30 UTC on 1 March is already 2 March in Bucharest, the app's time zone.
      await asOwner((db) =>
        db.query(
          "UPDATE claude_connections SET connected_at = '2026-03-01T22:30:00Z' FROM users WHERE users.id = claude_connections.user_id AND users.issuer = 'dev' AND users.subject = $1",
          [name],
        ),
      );
      await openSettings(page);
      await expect(claudeCard(page).getByText("Connected 02.03.2026")).toBeVisible();
    },
  );
});

test("a double tap on Save connects once [D-043]", async ({ signedInPage: page }) => {
  await openSettings(page);
  const token = fakeToken();
  await claudeCard(page).getByRole("button", { name: "Connect Claude" }).click();
  const form = page.getByRole("dialog", { name: "Connect Claude" });
  await form.getByLabel("Token").fill(token);
  expect(await writesIn(page, center(await form.getByRole("button", { name: "Save" }).boundingBox()), token)).toBe(1);
  await expect(account(page)).toBeVisible();
  await expect(page.getByText("Connected Claude")).toHaveCount(1);
});
