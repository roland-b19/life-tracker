import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { andSettle, expectNoSeriousViolations, test } from "./helpers";

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

// Only one Undo button may exist at a time, so a toast is dismissed before the step that makes the next one.
async function dismissToast(page: Page, message: string) {
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByText(message)).toBeHidden();
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
  // The sidebar link only exists with the Claude flag on (the e2e server sets it).
  await page.goto("/health");
  await page.getByRole("navigation", { name: "Main Navigation" }).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(notConnected(page)).toBeVisible();

  // A token that is not in the shape `claude setup-token` prints is refused, and the message stays in the form.
  await claudeCard(page).getByRole("button", { name: "Connect Claude" }).click();
  const form = page.getByRole("dialog", { name: "Connect Claude" });
  await form.getByLabel("Token").fill("not-a-token");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form.getByRole("alert")).toHaveText("Please paste the token that claude setup-token prints.");
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

test("the export downloads the user's data and never the Claude token", async ({ signedInPage: page }) => {
  // Hold a secret first, so the export has something it must leave out.
  const token = fakeToken();
  await openSettings(page);
  await connect(page, token);

  const exportButton = page.getByRole("navigation", { name: "Main Navigation" }).getByRole("button", { name: "Export data" });
  const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  expect(download.suggestedFilename()).toMatch(/^life-tracker-export-\d{4}-\d{2}-\d{2}\.txt$/);
  await expect(page.getByText("Exported your data")).toBeVisible();

  // Read in memory: nothing is saved outside the test's own output.
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  expect(text).toContain("Life Tracker: all your data");
  expect(text).toContain("== Account (1) ==");
  expect(text).not.toContain(token);
  expect(text).not.toContain("sk-ant-");
});
