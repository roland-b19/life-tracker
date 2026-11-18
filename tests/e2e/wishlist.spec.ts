import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Serious and critical findings fail the spec.
async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function signInAsNewUser(page: Page) {
  await page.goto("/signin");
  // Right after loading, two parallel /api/auth/session calls each set a CSRF cookie. A click before they finish posts a
  // stale token: NextAuth answers 200 without a session and the next page bounces back to /signin.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Username").fill(`e2e-${randomUUID().slice(0, 8)}`);
  await page.getByRole("button", { name: "Continue" }).click();
  // The form pushes "/", which redirects to /food.
  await expect(page).toHaveURL(/\/food$/);
}

test("an anonymous visit to the Wishlist goes to the sign-in page", async ({ page }) => {
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("a signed-in user adds, undoes, deletes and restores a wishlist item", async ({ page }) => {
  await signInAsNewUser(page);
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
  await expectNoSeriousViolations(page);

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
