import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  id: "",
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/server/auth", () => ({
  UnauthorizedError: authState.UnauthorizedError,
  requireUser: vi.fn(async () => {
    if (!authState.id) throw new authState.UnauthorizedError();
    return authState.id;
  }),
}));
import { db } from "@/server/db";
import { todos, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCategories } from "@/lib/categories";
import { addWishlistItem, getWishlist } from "@/lib/wishlist";
import { createTodo, getDailyTodos, toggleTodo } from "@/lib/todos";
import { addCategoryAction, deleteCategoryAction, renameCategoryAction, reorderCategoriesAction, revertCategoryAction } from "@/app/actions/categories";
import { addDays, toISODate } from "@/lib/format-date";

async function seedUser(subject: string) {
  const [user] = await db.insert(users).values({ issuer: "test", subject }).returning({ id: users.id });
  return user.id;
}

describe("Categories: lists, items and multi-user isolation", () => {
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    userA = await seedUser(`categories-userA-${randomUUID()}`);
    userB = await seedUser(`categories-userB-${randomUUID()}`);
  });

  it("adds, renames and deletes a category, moving the items with it", async () => {
    authState.id = userA;
    expect((await addCategoryAction({ scope: "wishlist", name: "  Gifts " })).success).toBe(true);
    expect((await addCategoryAction({ scope: "wishlist", name: "gifts" })).success).toBe(false);
    const item = await addWishlistItem(userA, { name: "Scarf", estimatedPrice: 20, category: "gifts" });
    expect(item.category).toBe("gifts");

    await renameCategoryAction({ scope: "wishlist", from: "gifts", to: "presents" });
    expect((await getWishlist(userA))[0].category).toBe("presents");
    expect((await getCategories(userA, ["wishlist"])).wishlist).toEqual(["presents"]);

    await deleteCategoryAction({ scope: "wishlist", name: "presents" });
    expect((await getWishlist(userA))[0].category).toBe("other");
    expect((await getCategories(userA, ["wishlist"])).wishlist).toEqual([]);
  });

  it("merges when a rename lands on an existing category, and refuses 'other'", async () => {
    authState.id = userA;
    await addCategoryAction({ scope: "personal", name: "home" });
    await addCategoryAction({ scope: "personal", name: "house" });
    await createTodo(userA, {
      space: "personal",
      title: "Fix tap",
      isRecurring: true,
      recurrencePattern: "daily",
      dueDate: toISODate(),
      category: "home",
    });
    await renameCategoryAction({ scope: "personal", from: "home", to: "house" });
    expect((await getCategories(userA, ["personal"])).personal).toEqual(["house"]);
    const { todos } = await getDailyTodos(userA, "personal", toISODate());
    expect(todos.find((t) => t.title === "Fix tap")?.category).toBe("house");

    await expect(renameCategoryAction({ scope: "personal", from: "house", to: "other" })).rejects.toThrow();
    await expect(addCategoryAction({ scope: "personal", name: "other" })).rejects.toThrow();
  });

  it("deleting a task category refiles all its tasks to other", async () => {
    authState.id = userA;
    const today = toISODate();
    const day = (n: number) => addDays(today, n);
    await addCategoryAction({ scope: "personal", name: "gym" });
    await createTodo(userA, { space: "personal", title: "Lift", isRecurring: true, recurrencePattern: "daily", dueDate: day(-3), category: "gym" });
    const old = await createTodo(userA, { space: "personal", title: "Old one", isRecurring: false, recurrencePattern: "none", dueDate: day(-1), category: "gym" });
    const catOn = async (d: string, title: string) => (await getDailyTodos(userA, "personal", d, today)).todos.find((t) => t.title === title)?.category;

    await deleteCategoryAction({ scope: "personal", name: "gym" });
    expect(await catOn(today, "Lift")).toBe("other");
    expect(await catOn(day(-1), "Old one")).toBe("other");
    expect(old.category).toBe("gym"); // the row returned at creation, before the delete
    expect((await getCategories(userA, ["personal"])).personal).not.toContain("gym");
  });

  it("Undo of a task category delete brings every row back exactly as it was", async () => {
    authState.id = userA;
    const today = toISODate();
    const day = (n: number) => addDays(today, n);
    await addCategoryAction({ scope: "personal", name: "undo-cat" });
    const run = await createTodo(userA, { space: "personal", title: "Undo run", isRecurring: true, recurrencePattern: "daily", dueDate: day(-5), category: "undo-cat" });
    const fresh = await createTodo(userA, { space: "personal", title: "Undo fresh", isRecurring: true, recurrencePattern: "daily", dueDate: today, category: "undo-cat" });
    await toggleTodo(userA, { id: run.id, isCompleted: true });
    await toggleTodo(userA, { id: fresh.id, isCompleted: true });
    const state = async () => ({
      rows: (await db.select().from(todos).where(eq(todos.userId, userA))).sort((a, b) => a.id.localeCompare(b.id)),
    });
    const before = await state();

    const del = await deleteCategoryAction({ scope: "personal", name: "undo-cat" });
    expect((await state()).rows.length).toBe(before.rows.length); // refiled in place, never split
    await revertCategoryAction({ scope: "personal", name: "undo-cat", current: "other", dropCurrent: false, ...del.change! });

    const after = await state();
    expect(after.rows).toEqual(before.rows);
    expect((await getCategories(userA, ["personal"])).personal).toContain("undo-cat");
  });

  it("adds a category when an item is saved with a new one", async () => {
    await addWishlistItem(userA, { name: "Lamp", estimatedPrice: 30, category: "decor" });
    expect((await getCategories(userA, ["wishlist"])).wishlist).toContain("decor");
  });

  it("denies another user: they neither see nor change the owner's categories", async () => {
    authState.id = userA;
    await addCategoryAction({ scope: "business", name: "clients" });

    authState.id = userB;
    expect((await getCategories(userB, ["business", "wishlist"])).business).toEqual([]);
    expect((await renameCategoryAction({ scope: "business", from: "clients", to: "x" })).success).toBe(false);
    expect((await deleteCategoryAction({ scope: "business", name: "clients" })).success).toBe(false);
    expect((await getCategories(userA, ["business"])).business).toEqual(["clients"]);
  });

  it("undoes a delete and a rename for exactly the items that moved, and only for the owner", async () => {
    authState.id = userA;
    await addCategoryAction({ scope: "wishlist", name: "books" });
    await addCategoryAction({ scope: "wishlist", name: "games" });
    const inBooks = await addWishlistItem(userA, { name: "Novel", estimatedPrice: 20, category: "books" });
    const alreadyOther = await addWishlistItem(userA, { name: "Misc", estimatedPrice: 5, category: "other" });
    const catOf = async (id: string) => (await getWishlist(userA)).find((i) => i.id === id)?.category;

    const del = await deleteCategoryAction({ scope: "wishlist", name: "books" });
    expect(del.change?.itemIds).toEqual([inBooks.id]);
    const undo = { scope: "wishlist", name: "books", current: "other", dropCurrent: false, ...del.change! };

    // Another user cannot revert it: the owner's item stays in Other.
    authState.id = userB;
    await revertCategoryAction(undo);
    expect(await catOf(inBooks.id)).toBe("other");

    authState.id = userA;
    await revertCategoryAction(undo);
    expect(await catOf(inBooks.id)).toBe("books");
    expect(await catOf(alreadyOther.id)).toBe("other");
    expect((await getCategories(userA, ["wishlist"])).wishlist).toContain("books");

    // A rename onto a new name is undone, dropping the new name again; a merge keeps the existing target.
    const ren = await renameCategoryAction({ scope: "wishlist", from: "books", to: "reading" });
    expect(await catOf(inBooks.id)).toBe("reading");
    await revertCategoryAction({ scope: "wishlist", name: "books", current: "reading", dropCurrent: !ren.change!.merged, ...ren.change! });
    expect(await catOf(inBooks.id)).toBe("books");
    const cats = (await getCategories(userA, ["wishlist"])).wishlist;
    expect(cats).toContain("books");
    expect(cats).not.toContain("reading");

    const merge = await renameCategoryAction({ scope: "wishlist", from: "books", to: "games" });
    expect(merge.change?.merged).toBe(true);
    await revertCategoryAction({ scope: "wishlist", name: "books", current: "games", dropCurrent: false, ...merge.change! });
    expect(await catOf(inBooks.id)).toBe("books");
    expect((await getCategories(userA, ["wishlist"])).wishlist).toEqual(expect.arrayContaining(["books", "games"]));
  });

  it("reorders the owner's categories; another user or an anonymous caller changes nothing", async () => {
    authState.id = userA;
    for (const name of ["first", "second", "third"]) await addCategoryAction({ scope: "personal", name });
    const list = async () => (await getCategories(userA, ["personal"])).personal.filter((c) => ["first", "second", "third"].includes(c));
    expect(await list()).toEqual(["first", "second", "third"]);

    await reorderCategoriesAction({ scope: "personal", names: ["third", "first", "second"] });
    expect(await list()).toEqual(["third", "first", "second"]);

    authState.id = userB;
    await addCategoryAction({ scope: "personal", name: "first" });
    await reorderCategoriesAction({ scope: "personal", names: ["third", "second", "first"] });
    expect(await list()).toEqual(["third", "first", "second"]);

    authState.id = userA;
    await expect(reorderCategoriesAction({ scope: "personal", names: ["first", "first"] })).rejects.toThrow();
    authState.id = "";
    await expect(reorderCategoriesAction({ scope: "personal", names: ["first"] })).rejects.toThrow();
  });
});
