import { randomUUID } from "node:crypto";
import { expect, type Page, type Request } from "@playwright/test";
import { Pool } from "pg";
import { andSettle, burst, center, expectNoSeriousViolations, isRefresh, settled, test } from "./helpers";

async function openWishlist(page: Page) {
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
}

// Tests tagged @a11y run on every project (desktop and phone width, dark and light); the rest run on desktop only, because only the
// axe scan depends on the width and the color scheme (see playwright.config.ts).
test("an anonymous visit to the Wishlist goes to a sign-in page without serious violations", { tag: "@a11y" }, async ({ page }) => {
  await page.goto("/wishlist");
  await expect(page).toHaveURL(/\/signin\?next=%2Fwishlist$/);
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
  const total = page.getByRole("region", { name: "Estimated investment · All" });
  const added = page.getByText(`Added "${name}" (1.234 RON)`);
  // The total counts up over about 600 ms, so it is checked with a retrying assertion.
  const expectTotal = (amount: string) => expect(total).toHaveText(new RegExp(`^Estimated investment · All\\s*${amount} RON$`));

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

// The guard's per-target lock (D-043; the form is one target) on its own: a form submitted again after the tap burst is over, while
// its first save is still unanswered, saves nothing more. The answer is held past the burst; Save and the fields are
// disabled while saving, so the second submit is the form's own requestSubmit().
test("a form submitted again while its save is unanswered saves once", async ({ signedInPage: page }) => {
  await openWishlist(page);
  const name = `E2E item ${randomUUID().slice(0, 8)}`;
  const writes: Request[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && "next-action" in r.headers() && (r.postData() ?? "").includes(`"name":"${name}"`)) writes.push(r);
  });
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/wishlist", async (route) => {
    if (route.request().method() === "POST" && "next-action" in route.request().headers()) await held;
    await route.fallback();
  });

  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New item" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByLabel("Price (RON)").fill("100");
  // Counts the form's submits, so the test knows the second one really happened.
  await page.evaluate(() => {
    const w = window as typeof window & { submits?: number };
    w.submits = 0;
    window.addEventListener("submit", () => (w.submits! += 1), true);
  });
  const submits = () => page.evaluate(() => (window as typeof window & { submits?: number }).submits);
  await form.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => writes.length).toBe(1);
  // A keydown ends the tap burst, so only the lock stands in the way of the next submit.
  await page.keyboard.press("Shift");
  await form.locator("form").evaluate((f: HTMLFormElement) => f.requestSubmit());
  expect(await submits()).toBe(2);
  expect(writes).toHaveLength(1);

  release();
  await page.waitForResponse((r) => r.request() === writes[0]);
  // Server actions are sent one at a time, so a second save would go out right after the first answer, well before
  // the refresh the page makes 600 ms after its last answer; `settled` then covers anything sent before that.
  await page.waitForRequest((r) => isRefresh(page, r));
  await settled(page);
  expect(writes).toHaveLength(1);
  await expect(page.getByText(`Added "${name}" (100 RON)`)).toHaveCount(1);
  await expect(page.getByText(name, { exact: true })).toHaveCount(1);
});

// Adds an item through the form and waits for its toast; `toast` is the price as the toast shows it.
async function addItem(page: Page, name: string, price: string, toast = price) {
  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New item" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByLabel("Price (RON)").fill(price);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"name":"${name}"`);
  await expect(page.getByText(`Added "${name}" (${toast} RON)`, { exact: true })).toBeVisible();
  // Ends the tap burst (D-043), so the next tap is a new one.
  await page.keyboard.press("Shift");
}

const itemRow = (page: Page, name: string) =>
  page.locator(".item-row").filter({ has: page.getByText(name, { exact: true }) });

test("a signed-out visit to /wishlist goes to the sign-in form, which comes back to /wishlist [PATH]", async ({ page }) => {
  const name = `e2e-${randomUUID().slice(0, 8)}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
  try {
    await page.goto("/wishlist", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/signin\?next=%2Fwishlist$/);
    await page.getByLabel("Username").fill(name);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/wishlist$/);
    await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
  } finally {
    try {
      await admin.query("DELETE FROM users WHERE issuer = 'dev' AND subject = $1", [name]);
    } finally {
      await admin.end();
    }
  }
});

test("a price keeps its cents in the badge, the total, the toast and the edit form, in the app's number format [WISH-05, WISH-08]", async ({
  signedInPage: page,
}) => {
  await openWishlist(page);
  const [a, b] = [`E2E item ${randomUUID().slice(0, 8)}`, `E2E item ${randomUUID().slice(0, 8)}`];
  await addItem(page, a, "1234,5", "1.234,50");
  await addItem(page, b, "100", "100");
  await expect(itemRow(page, a)).toContainText("1.234,50 RON");
  await expect(itemRow(page, b)).toContainText("100 RON");
  const total = page.getByRole("region", { name: "Estimated investment · All" });
  await expect(total).toHaveText(/^Estimated investment · All\s*1\.334,50 RON$/);
  await page.getByRole("button", { name: `Edit ${a}`, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit item" }).getByLabel("Price (RON)")).toHaveValue("1.234,50");
});

test("the total names the open tab, and the tab and the sort are kept on this device [WISH-09, WISH-11]", async ({ signedInPage: page }) => {
  await openWishlist(page);
  const [cheap, dear] = [`E2E cheap ${randomUUID().slice(0, 8)}`, `E2E dear ${randomUUID().slice(0, 8)}`];
  await addItem(page, cheap, "10");
  await addItem(page, dear, "1000", "1.000");
  await page.getByRole("tab", { name: "< 250" }).click();
  await expect(page.getByRole("region", { name: "Estimated investment · < 250" })).toHaveText(/10 RON$/);
  await page.getByRole("tab", { name: "All" }).click();
  await page.getByLabel("Sort items").selectOption({ label: "Price ↓" });
  const names = page.locator(".item-name");
  await expect(names).toHaveText([dear, cheap]);
  await page.getByRole("tab", { name: "750+" }).click();
  await page.reload();
  await expect(page.getByRole("region", { name: "Estimated investment · 750+" })).toHaveText(/1\.000 RON$/);
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByLabel("Sort items")).toHaveValue("price-desc");
  await expect(names).toHaveText([dear, cheap]);
});

test("too-long text shows the server's words in the form and keeps what was typed [WISH-06]", async ({ signedInPage: page }) => {
  await openWishlist(page);
  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New item" });
  const long = "x".repeat(121);
  await form.getByLabel("Name", { exact: true }).fill(long);
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue(long);
  await form.getByLabel("Price (RON)").fill("10");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(form.getByText("Too long (max 120)")).toBeVisible();
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue(long);
});

test("a double tap on an item's Delete deletes it once [WISH-01]", async ({ signedInPage: page }) => {
  await openWishlist(page);
  const [a, b] = [`E2E item ${randomUUID().slice(0, 8)}`, `E2E item ${randomUUID().slice(0, 8)}`];
  await addItem(page, a, "10");
  await addItem(page, b, "20");
  await page.getByRole("button", { name: "Dismiss notification" }).first().click();
  await page.getByRole("button", { name: "Dismiss notification" }).first().click();
  const remove = page.getByRole("button", { name: `Delete ${b}`, exact: true });
  expect(await burst(page, center(await remove.boundingBox()))).toBe(1);
  await expect(page.getByText(`Removed "${b}"`, { exact: true })).toHaveCount(1);
  await expect(page.getByText(a, { exact: true })).toBeVisible();
  await expect(page.getByText(/^Failed/)).toHaveCount(0);
});

// D-040: a newer change to a row takes the Undo off the older toasts about that row, and only those.
test("a newer change takes the Undo off the older toasts about the same item, and only those [D-040]", async ({ signedInPage: page }) => {
  await openWishlist(page);
  const [a, b] = [`E2E item ${randomUUID().slice(0, 8)}`, `E2E item ${randomUUID().slice(0, 8)}`];
  await addItem(page, a, "10");
  await addItem(page, b, "20");
  const toast = (text: string) => page.locator(".toast-item").filter({ hasText: text });
  // b's add toast stays; a is edited, then deleted.
  await page.getByRole("button", { name: `Edit ${a}`, exact: true }).click();
  const form = page.getByRole("dialog", { name: "Edit item" });
  await form.getByLabel("Price (RON)").fill("15");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await expect(toast(`Saved "${a}"`).getByRole("button", { name: "Undo" })).toBeVisible();
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: `Delete ${a}`, exact: true }).click());
  await expect(toast(`Removed "${a}"`).getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(toast(`Saved "${a}"`).getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect(toast(`Added "${a}"`).getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect(toast(`Added "${b}"`).getByRole("button", { name: "Undo" })).toBeVisible();
});

test("a category delete's toast loses its Undo once an item it moved is edited [D-040]", async ({ signedInPage: page }) => {
  await openWishlist(page);
  const category = `cat${randomUUID().slice(0, 6)}`;
  await page.getByRole("button", { name: "Add category" }).click();
  const catForm = page.getByRole("dialog", { name: "New category" });
  await catForm.getByLabel("Name", { exact: true }).fill(category);
  await andSettle(page, () => catForm.getByRole("button", { name: "Save" }).click(), `"name":"${category}"`);
  await expect(catForm).toBeHidden();
  const name = `E2E item ${randomUUID().slice(0, 8)}`;
  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New item" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByLabel("Price (RON)").fill("10");
  await form.getByLabel("Category").selectOption(category);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"name":"${name}"`);
  await page.keyboard.press("Shift");
  await andSettle(page, () => page.getByRole("button", { name: `Delete category ${category}`, exact: true }).click());
  const removed = page.locator(".toast-item").filter({ hasText: `Removed "${category}"` });
  await expect(removed.getByRole("button", { name: "Undo" })).toBeVisible();
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit item" });
  await edit.getByLabel("Price (RON)").fill("12");
  await andSettle(page, () => edit.getByRole("button", { name: "Save" }).click());
  await expect(page.getByText(`Saved "${name}"`, { exact: true })).toBeVisible();
  await expect(removed.getByRole("button", { name: "Undo" })).toHaveCount(0);
});

test("an add whose answer was lost, saved again, adds once and says it was already added [D-040]", async ({ signedInPage: page }) => {
  await openWishlist(page);
  const name = `E2E item ${randomUUID().slice(0, 8)}`;
  let lost = false;
  // The first add reaches the server, but its answer never comes back.
  await page.route("**/wishlist", async (route) => {
    const r = route.request();
    if (!lost && r.method() === "POST" && "next-action" in r.headers() && (r.postData() ?? "").includes(`"name":"${name}"`)) {
      lost = true;
      await route.fetch();
      return route.abort();
    }
    await route.fallback();
  });
  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New item" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByLabel("Price (RON)").fill("10");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText("Failed to save item. Please try again.")).toBeVisible();
  await page.keyboard.press("Shift");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"name":"${name}"`);
  const toast = page.locator(".toast-item").filter({ hasText: `Already added "${name}"` });
  await expect(toast).toBeVisible();
  await expect(toast.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(name, { exact: true })).toHaveCount(1);
});

test("an edit sends only what it changed, so another tab's change to the item stays [MORE-08, D-040]", async ({ signedInPage: page }) => {
  await openWishlist(page);
  const name = `E2E item ${randomUUID().slice(0, 8)}`;
  await addItem(page, name, "100");
  // This tab opens the edit form; another tab then changes the price.
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  const form = page.getByRole("dialog", { name: "Edit item" });
  const other = await page.context().newPage();
  try {
    await openWishlist(other);
    await other.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
    const otherForm = other.getByRole("dialog", { name: "Edit item" });
    await otherForm.getByLabel("Price (RON)").fill("300");
    await andSettle(other, () => otherForm.getByRole("button", { name: "Save" }).click());
    await expect(other.getByText(`Saved "${name}"`, { exact: true })).toBeVisible();
  } finally {
    await other.close();
  }
  // This form still shows the old price; it renames only.
  await expect(form.getByLabel("Price (RON)")).toHaveValue("100");
  await form.getByLabel("Name", { exact: true }).fill(`${name} v2`);
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click());
  await page.reload();
  await expect(itemRow(page, `${name} v2`)).toContainText("300 RON");
});

test("an item deleted in one tab leaves another tab after its refresh, without a reload [SERVER-STATE]", async ({ signedInPage: page }) => {
  await openWishlist(page);
  const name = `E2E item ${randomUUID().slice(0, 8)}`;
  await addItem(page, name, "10");
  const other = await page.context().newPage();
  try {
    await openWishlist(other);
    await expect(other.getByText(name, { exact: true })).toBeVisible();
    // A mark on the window: a reload would drop it.
    await other.evaluate(() => Object.assign(window, { kept: true }));
    await andSettle(page, () => page.getByRole("button", { name: `Delete ${name}`, exact: true }).click());
    await expect(other.getByText(name, { exact: true })).toBeHidden();
    expect(await other.evaluate(() => (window as Window & { kept?: boolean }).kept)).toBe(true);
  } finally {
    await other.close();
  }
});

test("a New item form opened while an earlier save is unanswered stays open when that save answers [WISH-12]", async ({ signedInPage: page }) => {
  await openWishlist(page);
  const [first, second] = [`E2E item ${randomUUID().slice(0, 8)}`, `E2E item ${randomUUID().slice(0, 8)}`];
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/wishlist", async (route) => {
    if (route.request().method() === "POST" && (route.request().postData() ?? "").includes(`"name":"${first}"`)) await held;
    await route.fallback();
  });
  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("dialog", { name: "New item" });
  await form.getByLabel("Name", { exact: true }).fill(first);
  await form.getByLabel("Price (RON)").fill("10");
  const answered = page.waitForResponse((r) => (r.request().postData() ?? "").includes(`"name":"${first}"`));
  await form.getByRole("button", { name: "Save" }).click();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();
  await page.getByRole("button", { name: "Add item" }).click();
  await form.getByLabel("Name", { exact: true }).fill(second);
  release();
  await answered;
  await expect(page.getByText(`Added "${first}" (10 RON)`, { exact: true })).toBeVisible();
  await expect(form).toBeVisible();
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue(second);
  await form.getByLabel("Price (RON)").fill("20");
  await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"name":"${second}"`);
  await expect(page.getByText(`Added "${second}" (20 RON)`, { exact: true })).toBeVisible();
  await expect(form).toBeHidden();
});

// A page reached by a client navigation shows the copy the browser keeps (staleTimes in next.config.ts) until the
// refresh after the unanswered write; the page then takes the refreshed categories in, without a reload. The copy is
// fresh once the refresh after the earlier writes ran, so the test waits for it (see the report on WISH-13).
test("after a client navigation while a write is unanswered, the categories card shows its categories, then the write's result [WISH-13]", async ({
  signedInPage: page,
}) => {
  await openWishlist(page);
  const [kept, deleted] = [`cat${randomUUID().slice(0, 6)}`, `cat${randomUUID().slice(0, 6)}`];
  let refreshed: Promise<Request> | undefined;
  for (const category of [kept, deleted]) {
    await page.getByRole("button", { name: "Add category" }).click();
    const form = page.getByRole("dialog", { name: "New category" });
    await form.getByLabel("Name", { exact: true }).fill(category);
    refreshed = page.waitForRequest((r) => isRefresh(page, r));
    await andSettle(page, () => form.getByRole("button", { name: "Save" }).click(), `"name":"${category}"`);
    await expect(form).toBeHidden();
  }
  await (await refreshed!).response();
  const card = page.getByRole("region", { name: /^Categories/ });
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/wishlist", async (route) => {
    if (route.request().method() === "POST" && (route.request().postData() ?? "").includes(`"name":"${deleted}"`)) await held;
    await route.fallback();
  });
  await page.keyboard.press("Shift");
  const answered = page.waitForResponse((r) => (r.request().postData() ?? "").includes(`"name":"${deleted}"`));
  await page.getByRole("button", { name: `Delete category ${deleted}`, exact: true }).click();
  // Marks the document: a full reload would drop it.
  await page.evaluate(() => Object.assign(window, { kept: true }));
  const nav = page.getByRole("navigation", { name: "Main Navigation" });
  await nav.getByRole("link", { name: "Tasks" }).click();
  await expect(page).toHaveURL(/\/todos$/);
  await nav.getByRole("link", { name: "Wishlist" }).click();
  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(card.getByText(kept, { exact: true })).toBeVisible();
  release();
  await answered;
  // The refresh after the answer brings the delete in, without a reload.
  await expect(card.getByText(deleted, { exact: true })).toBeHidden();
  await expect(card.getByText(kept, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { kept?: boolean }).kept)).toBe(true);
});
