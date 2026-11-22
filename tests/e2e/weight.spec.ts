import { expect, type Page } from "@playwright/test";
import { addDays, appDay, formatDM, toISODate } from "../../src/lib/format-date";
import { andSettle, countRefreshes, dismissToast, expectNoSeriousViolations, settled, test } from "./helpers";

async function openFood(page: Page) {
  await page.goto("/health");
  await expect(page).toHaveURL(/\/health$/);
  await expect(page.getByRole("region", { name: "Weight", exact: true })).toBeVisible();
}

async function addWeight(page: Page, kilograms: string) {
  const card = page.getByRole("region", { name: "Weight", exact: true });
  const form = page.getByRole("dialog", { name: "Edit weight" });
  await card.getByRole("button", { name: "Edit today's weight" }).click();
  await form.getByLabel("Weight today (kg)").fill(kilograms);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form).toBeHidden();
  await expect(card.getByText(`${kilograms} kg today`, { exact: true })).toBeVisible();
}

// The first moment of the Bucharest day after `day`, found by stepping through the hours around it (the offset is 2 or 3).
function midnightAfter(day: string) {
  let t = Date.parse(`${addDays(day, 1)}T00:00:00Z`) - 4 * 3600_000;
  while (appDay(new Date(t)) === day) t += 60_000;
  return t;
}
const lastAxisLabel = (page: Page) => page.getByRole("region", { name: "Weight", exact: true }).locator(".line-axis span").last();

function watchHydration(page: Page) {
  const warnings: string[] = [];
  page.on("console", (m) => {
    if (/hydrat/i.test(m.text())) warnings.push(m.text());
  });
  return warnings;
}

// Tests tagged @a11y run on every project (desktop and phone width, dark and light); the rest run on desktop only, because only the
// axe scan depends on the width and the color scheme (see playwright.config.ts).
test("the home page with the weight form open has no serious violations", { tag: "@a11y" }, async ({ signedInPage: page }) => {
  await openFood(page);
  await expectNoSeriousViolations(page);
  await page.getByRole("button", { name: "Edit today's weight" }).click();
  await expect(page.getByRole("dialog", { name: "Edit weight" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("a signed-in user adds, edits and deletes today's weight, with Undo for the edit and the delete", async ({ signedInPage: page }) => {
  await openFood(page);

  const card = page.getByRole("region", { name: "Weight", exact: true });
  const form = page.getByRole("dialog", { name: "Edit weight" });
  const field = form.getByLabel("Weight today (kg)");
  const today = (kilograms: string) => card.getByText(`${kilograms} kg today`, { exact: true });

  // Weights show a decimal comma, like the rest of the app; the form shows two decimals.
  await expect(card.getByText("— kg today", { exact: true })).toBeVisible();

  // Add today's weight.
  await card.getByRole("button", { name: "Edit today's weight" }).click();
  await field.fill("72,4");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form).toBeHidden();
  await expect(page.getByText("Added 72,4 kg")).toBeVisible();
  await expect(today("72,4")).toBeVisible();
  await expect(card.getByText("7-day average · 72,4 kg")).toBeVisible();
  // The chart's value axis writes its numbers in the app's format too, with a decimal comma (D-037).
  await expect(card.locator(".line-y span")).toHaveText(["72,4"]);

  // Edit it: the form opens with the saved value. Drop the "Added" toast first so only one Undo exists.
  await dismissToast(page, "Added 72,4 kg");
  await card.getByRole("button", { name: "Edit today's weight" }).click();
  await expect(field).toHaveValue("72,40");
  await field.fill("71,8");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form).toBeHidden();
  await expect(page.getByText("Weight set to 71,8 kg")).toBeVisible();
  await expect(today("71,8")).toBeVisible();

  // Undo the edit: the old value is back, and it is what the database holds.
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(today("72,4")).toBeVisible();
  await page.reload();
  await expect(today("72,4")).toBeVisible();

  // Delete it, then Undo the delete: the same weigh-in comes back, also after a reload.
  await andSettle(page, () => card.getByRole("button", { name: "Delete today's weight" }).click());
  await expect(page.getByText("Removed 72,4 kg")).toBeVisible();
  await expect(card.getByText("— kg today", { exact: true })).toBeVisible();
  await andSettle(page, () => page.getByRole("button", { name: "Undo" }).click());
  await expect(today("72,4")).toBeVisible();
  await page.reload();
  await expect(today("72,4")).toBeVisible();
});

// The page's clock is half an hour into the next Bucharest day while the server is still on today: the card and the chart
// show the server's day, and the browser's render matches the server's, so React warns of nothing.
test("the weight card and chart show the server's day, whatever the device's clock says [HTODAY-01]", async ({ signedInPage: page }) => {
  const warnings = watchHydration(page);
  await openFood(page);
  await addWeight(page, "72,4");
  // The server's day: the tests run on the machine that serves the app. The page's own clock is moved with `page.clock`.
  const day = toISODate();
  await page.clock.install({ time: new Date(midnightAfter(day) + 30 * 60_000) });
  await openFood(page);
  await expect(page.getByRole("region", { name: "Weight", exact: true }).getByText("72,4 kg today", { exact: true })).toBeVisible();
  await expect(lastAxisLabel(page)).toHaveText(formatDM(day));
  await settled(page);
  expect(warnings).toEqual([]);
});

// At the device's midnight the page refreshes once, through the app's day watch, and the chart takes its day from that
// refresh, not from the device: here the server is still on today, so the chart still ends on it. No reload either.
test("at midnight the page refreshes once and the chart keeps the server's day, without a reload [HTODAY-11]", async ({ signedInPage: page }) => {
  const warnings = watchHydration(page);
  const day = toISODate();
  await page.clock.install({ time: new Date(midnightAfter(day) - 30_000) });
  await openFood(page);
  await expect(lastAxisLabel(page)).toHaveText(formatDM(day));
  await page.evaluate(() => Object.assign(window, { kept: true }));
  const refreshes = countRefreshes(page);
  await page.clock.runFor(20_000);
  await settled(page);
  expect(refreshes).toHaveLength(0);
  await page.clock.runFor(20_000);
  await expect.poll(() => refreshes.length).toBe(1);
  await refreshes[0].response();
  await settled(page);
  await expect(lastAxisLabel(page)).toHaveText(formatDM(day));
  expect(await page.evaluate(() => (window as Window & { kept?: boolean }).kept)).toBe(true);
  expect(warnings).toEqual([]);
});
