import { expect, type Page } from "@playwright/test";
import { andSettle, expectNoSeriousViolations, test } from "./helpers";

async function openFood(page: Page) {
  await page.goto("/health");
  await expect(page).toHaveURL(/\/health$/);
  await expect(page.getByRole("region", { name: "Weight", exact: true })).toBeVisible();
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

  // Edit it: the form opens with the saved value. Drop the "Added" toast first so only one Undo exists.
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(page.getByText("Added 72,4 kg")).toBeHidden();
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
