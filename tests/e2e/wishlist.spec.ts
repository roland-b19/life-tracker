import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { andSettle, burst, center, expectNoSeriousViolations, test } from "./helpers";

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

// A quick double tap on a form's Save (FormModal, D-043) saves once, and its second tap does not land on what lies under
// the closed dialog: here another item's Edit button, lined up under Save. Both at desktop and at phone width.
for (const size of [
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
]) {
  test(`a double tap on a form's Save saves once and opens nothing under it, at ${size.width} wide`, async ({ signedInPage: page }) => {
    test.slow();
    await page.setViewportSize(size);
    await openWishlist(page);
    const names = [1, 2, 3, 4].map(() => `E2E item ${randomUUID().slice(0, 8)}`);
    for (const name of names) {
      await page.getByRole("button", { name: "Add item" }).click();
      await page.getByLabel("Name", { exact: true }).fill(name);
      await page.getByLabel("Price (RON)").fill("100");
      await andSettle(page, () => page.getByRole("button", { name: "Save" }).click(), `"name":"${name}"`);
      await expect(page.getByText(`Added "${name}" (100 RON)`)).toBeVisible();
      await page.getByRole("button", { name: "Dismiss notification" }).click();
      await expect(page.getByRole("button", { name: "Dismiss notification" })).toHaveCount(0);
    }

    // One item's Edit is lined up under Save of another item's Edit form. The page cannot scroll while the form is
    // open, so it is lined up first, and the form then opens without a scroll (a dispatched click).
    const [under, edited] = [names[0], names[1]];
    const openEdit = page.getByRole("button", { name: `Edit ${edited}`, exact: true });
    const form = page.getByRole("dialog", { name: "Edit item" });
    await openEdit.click();
    const saveBox = await form.getByRole("button", { name: "Save" }).boundingBox();
    const save = center(saveBox);
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(form).toBeHidden();
    const edit = page.getByRole("button", { name: `Edit ${under}`, exact: true });
    await page.evaluate((dy) => window.scrollBy(0, dy), center(await edit.boundingBox()).y - save.y);
    const spot = { x: center(await edit.boundingBox()).x, y: save.y };
    expect(Math.abs(center(await edit.boundingBox()).y - spot.y)).toBeLessThan(10);
    expect(spot.x).toBeGreaterThan(saveBox!.x);
    expect(spot.x).toBeLessThan(saveBox!.x + saveBox!.width);

    await openEdit.dispatchEvent("click");
    await form.getByLabel("Link or store (optional)").fill("example.com");
    expect(await burst(page, spot)).toBe(1);
    await expect(page.getByText(`Saved "${edited}"`, { exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The other item's Edit is where the second tap landed: the guard, not a miss, kept its form closed.
    expect(Math.abs(center(await edit.boundingBox()).y - spot.y)).toBeLessThan(10);
  });
}
