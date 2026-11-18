import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";
import { Pool } from "pg";

// Serious and critical findings fail the spec.
async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function signIn(page: Page, name: string) {
  // Sign in through NextAuth's own endpoints instead of the form. On /signin two parallel /api/auth/session calls each
  // set a CSRF cookie, so a click that comes too early posts a stale token and no session is created. Here the token and
  // its cookie come from one request, and the request context shares its cookie jar with the page.
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
  const response = await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, name, json: "true" },
  });
  expect(response.ok()).toBe(true);
  // Without a session the next page would bounce back to /signin.
  await page.goto("/food");
  await expect(page).toHaveURL(/\/food$/);
}

// `signedInPage` signs in as a new dev user and deletes that user afterwards; the user's rows go with it (ON DELETE
// CASCADE). The app role cannot delete users, so the cleanup uses the owner URL like the Vitest tests do. The config
// refuses a non-local DATABASE_URL and DATABASE_URL_MIGRATE, so this only ever touches the local test database.
const test = base.extend<{ signedInPage: Page }>({
  signedInPage: async ({ page }, provide) => {
    const name = `e2e-${randomUUID().slice(0, 8)}`;
    const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
    try {
      await signIn(page, name);
      await provide(page);
    } finally {
      try {
        await admin.query("DELETE FROM users WHERE issuer = 'dev' AND subject = $1", [name]);
      } finally {
        await admin.end();
      }
    }
  },
});

// Tests tagged @a11y run on every project (desktop and phone width); the rest run on desktop only, because only the
// axe scan depends on the width (see playwright.config.ts).
test("an anonymous visit to the Wishlist goes to a sign-in page without serious violations", { tag: "@a11y" }, async ({ page }) => {
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("the Wishlist has no serious violations", { tag: "@a11y" }, async ({ signedInPage: page }) => {
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("a signed-in user adds, undoes, deletes and restores a wishlist item", async ({ signedInPage: page }) => {
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();

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
