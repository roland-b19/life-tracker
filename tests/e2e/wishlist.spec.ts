import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { expectNoSeriousViolations, test } from "./helpers";

async function openWishlist(page: Page) {
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
}

// Tests tagged @a11y run on every project (desktop and phone width, dark and light); the rest run on desktop only, because only the
// axe scan depends on the width and the color scheme (see playwright.config.ts).
test("an anonymous visit to the Wishlist goes to a sign-in page without serious violations", { tag: "@a11y" }, async ({ page }) => {
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("the Wishlist has no serious violations", { tag: "@a11y" }, async ({ signedInPage: page }) => {
  await openWishlist(page);
  await expectNoSeriousViolations(page);
});

test("a signed-in user adds, undoes, deletes and restores a wishlist item", async ({ signedInPage: page }) => {
  await openWishlist(page);

  const name = `E2E item ${randomUUID().slice(0, 8)}`;
  const row = page.getByText(name, { exact: true });
  const total = page.getByRole("region", { name: "Estimated Investment" });
  const added = page.getByText(`Added "${name}" (1.234 RON)`);
  // The total counts up over about 600 ms, so it is checked with a retrying assertion.
  const expectTotal = (amount: string) => expect(total).toHaveText(new RegExp(`^Estimated Investment\\s*${amount} RON$`));

  async function addItem() {
    await page.getByRole("button", { name: "Add item" }).click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Price (RON)").fill("1234");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(row).toBeVisible();
    await expect(added).toBeVisible();
  }

  // Add, then Undo the add.
  await addItem();
  await expectTotal("1\\.234");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row).toBeHidden();
  await expectTotal("0");

  // Add again, drop its toast so only one Undo exists, then Delete and Undo the delete.
  await addItem();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(added).toBeHidden();
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await expect(row).toBeHidden();
  await expect(page.getByText(`Removed "${name}"`)).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row).toBeVisible();
  await expectTotal("1\\.234");
});
