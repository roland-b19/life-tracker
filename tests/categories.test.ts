import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", async () => (await import("./auth")).authModule);
import { authState, seedUser } from "./auth";
import { db } from "@/server/db";
import { itemCategories, todos } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getCategories } from "@/lib/categories";
import { addWishlistItem, getWishlist } from "@/lib/wishlist";
import { addTodo, getDailyTodos, toggleTodo } from "@/lib/todos";
import { addCategoryAction, deleteCategoryAction, renameCategoryAction, reorderCategoriesAction, revertCategoryAction } from "@/actions/categories";
import { addDays, toISODate } from "@/lib/format-date";
import type { CategoryScope } from "@/lib/validations/categories";
import { SIGNED_OUT } from "@/lib/validations/result";
import { succeeded } from "./succeeded";

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
    expect(await addCategoryAction({ scope: "wishlist", name: "gifts" })).toEqual({ success: false, error: '"gifts" already exists.' });
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
    await addTodo(userA, {
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

    expect(await renameCategoryAction({ scope: "personal", from: "house", to: "other" })).toEqual({ success: false, error: '"other" is built in.' });
    expect(await addCategoryAction({ scope: "personal", name: "other" })).toEqual({ success: false, error: '"other" is built in.' });
  });

  it("deleting a task category refiles all its tasks to other", async () => {
    authState.id = userA;
    const today = toISODate();
    const day = (n: number) => addDays(today, n);
    await addCategoryAction({ scope: "personal", name: "gym" });
    await addTodo(userA, { space: "personal", title: "Lift", isRecurring: true, recurrencePattern: "daily", dueDate: day(-3), category: "gym" });
    const old = await addTodo(userA, { space: "personal", title: "Old one", isRecurring: false, recurrencePattern: "none", dueDate: day(-1), category: "gym" });
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
    const run = await addTodo(userA, { space: "personal", title: "Undo run", isRecurring: true, recurrencePattern: "daily", dueDate: day(-5), category: "undo-cat" });
    const fresh = await addTodo(userA, { space: "personal", title: "Undo fresh", isRecurring: true, recurrencePattern: "daily", dueDate: today, category: "undo-cat" });
    await toggleTodo(userA, { id: run.id, isCompleted: true });
    await toggleTodo(userA, { id: fresh.id, isCompleted: true });
    const state = async () => ({
      rows: (await db.select().from(todos).where(eq(todos.userId, userA))).sort((a, b) => a.id.localeCompare(b.id)),
    });
    const before = await state();

    const del = succeeded(await deleteCategoryAction({ scope: "personal", name: "undo-cat" }));
    expect((await state()).rows.length).toBe(before.rows.length); // refiled in place, never split
    await revertCategoryAction({ scope: "personal", name: "undo-cat", current: "other", dropCurrent: false, ...del.change });

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
    expect(await renameCategoryAction({ scope: "business", from: "clients", to: "x" })).toEqual({ success: false, error: "Category not found." });
    expect(await deleteCategoryAction({ scope: "business", name: "clients" })).toEqual({ success: false, error: "Category not found." });
    expect((await getCategories(userA, ["business"])).business).toEqual(["clients"]);
  });

  it("undoes a delete and a rename for exactly the items that moved, and only for the owner", async () => {
    authState.id = userA;
    await addCategoryAction({ scope: "wishlist", name: "books" });
    await addCategoryAction({ scope: "wishlist", name: "games" });
    const inBooks = await addWishlistItem(userA, { name: "Novel", estimatedPrice: 20, category: "books" });
    const alreadyOther = await addWishlistItem(userA, { name: "Misc", estimatedPrice: 5, category: "other" });
    const catOf = async (id: string) => (await getWishlist(userA)).find((i) => i.id === id)?.category;

    const del = succeeded(await deleteCategoryAction({ scope: "wishlist", name: "books" }));
    expect(del.change.itemIds).toEqual([inBooks.id]);
    const undo = { scope: "wishlist", name: "books", current: "other", dropCurrent: false, ...del.change };

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
    const ren = succeeded(await renameCategoryAction({ scope: "wishlist", from: "books", to: "reading" }));
    expect(await catOf(inBooks.id)).toBe("reading");
    await revertCategoryAction({ scope: "wishlist", name: "books", current: "reading", dropCurrent: !ren.change.merged, ...ren.change });
    expect(await catOf(inBooks.id)).toBe("books");
    const cats = (await getCategories(userA, ["wishlist"])).wishlist;
    expect(cats).toContain("books");
    expect(cats).not.toContain("reading");

    const merge = succeeded(await renameCategoryAction({ scope: "wishlist", from: "books", to: "games" }));
    expect(merge.change.merged).toBe(true);
    await revertCategoryAction({ scope: "wishlist", name: "books", current: "games", dropCurrent: false, ...merge.change });
    expect(await catOf(inBooks.id)).toBe("books");
    expect((await getCategories(userA, ["wishlist"])).wishlist).toEqual(expect.arrayContaining(["books", "games"]));
  });

  it("refuses a rename to the same name, and a revert never deletes the category it puts back", async () => {
    authState.id = userA;
    await addCategoryAction({ scope: "wishlist", name: "keepme" });
    expect(await renameCategoryAction({ scope: "wishlist", from: "keepme", to: "keepme" })).toEqual({ success: false, error: "That is already its name." });
    await revertCategoryAction({ scope: "wishlist", name: "keepme", current: "keepme", sortOrder: 1, itemIds: [], dropCurrent: true });
    expect((await getCategories(userA, ["wishlist"])).wishlist).toContain("keepme");
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
    expect(await reorderCategoriesAction({ scope: "personal", names: ["first", "first"] })).toEqual({ success: false, error: "Names must be unique." });
    authState.id = "";
    expect(await reorderCategoriesAction({ scope: "personal", names: ["first"] })).toEqual({ success: false, error: SIGNED_OUT });
    authState.id = userA;
    expect(await list()).toEqual(["third", "first", "second"]);
  });
});

describe("Categories: signed-out callers, repeated adds and Undo", () => {
  // A fresh owner per test, so the lists hold only what the test made.
  const owner = async () => (authState.id = await seedUser(`categories-${randomUUID()}`));
  const rows = (userId: string, scope: CategoryScope) =>
    db
      .select({ name: itemCategories.name, sortOrder: itemCategories.sortOrder })
      .from(itemCategories)
      .where(and(eq(itemCategories.userId, userId), eq(itemCategories.scope, scope)))
      .orderBy(asc(itemCategories.sortOrder), asc(itemCategories.name));
  const names = async (userId: string, scope: CategoryScope) => (await getCategories(userId, [scope]))[scope];

  it("every categories action answers a signed-out caller with the refusal and changes nothing", async () => {
    const userA = await owner();
    await addCategoryAction({ scope: "wishlist", name: "kept" });
    const before = await rows(userA, "wishlist");
    authState.id = "";
    const calls = [
      addCategoryAction({ scope: "wishlist", name: "new" }),
      renameCategoryAction({ scope: "wishlist", from: "kept", to: "x" }),
      deleteCategoryAction({ scope: "wishlist", name: "kept" }),
      revertCategoryAction({ scope: "wishlist", name: "kept", current: "other", sortOrder: 1, itemIds: [], dropCurrent: false }),
      reorderCategoriesAction({ scope: "wishlist", names: ["kept"] }),
      // Even with input that would fail validation, the session check answers first.
      addCategoryAction(undefined),
    ];
    for (const answer of await Promise.all(calls)) expect(answer).toEqual({ success: false, error: SIGNED_OUT });
    expect(await rows(userA, "wishlist")).toEqual(before);
  });

  it("add: owner allowed, a repeated add of the same name makes one row, another user's add stays in their own list", async () => {
    const userA = await owner();
    succeeded(await addCategoryAction({ scope: "wishlist", name: "twice" }));
    const again = await Promise.all([addCategoryAction({ scope: "wishlist", name: "twice" }), addCategoryAction({ scope: "wishlist", name: "Twice " })]);
    for (const answer of again) expect(answer).toEqual({ success: false, error: '"twice" already exists.' });
    expect(await rows(userA, "wishlist")).toEqual([{ name: "twice", sortOrder: 1 }]);

    const userB = await owner();
    succeeded(await addCategoryAction({ scope: "wishlist", name: "twice" }));
    expect(await names(userB, "wishlist")).toEqual(["twice"]);
    expect(await rows(userA, "wishlist")).toEqual([{ name: "twice", sortOrder: 1 }]);
  });

  it("rename and delete: owner allowed, another user denied", async () => {
    const userA = await owner();
    await addCategoryAction({ scope: "personal", name: "mine" });
    await owner();
    expect(await renameCategoryAction({ scope: "personal", from: "mine", to: "theirs" })).toEqual({ success: false, error: "Category not found." });
    expect(await deleteCategoryAction({ scope: "personal", name: "mine" })).toEqual({ success: false, error: "Category not found." });
    expect(await names(userA, "personal")).toEqual(["mine"]);

    authState.id = userA;
    succeeded(await renameCategoryAction({ scope: "personal", from: "mine", to: "ours" }));
    expect(await names(userA, "personal")).toEqual(["ours"]);
    succeeded(await deleteCategoryAction({ scope: "personal", name: "ours" }));
    expect(await names(userA, "personal")).toEqual([]);
  });

  it("revert: another user cannot undo the owner's rename; the owner can", async () => {
    const userA = await owner();
    await addCategoryAction({ scope: "wishlist", name: "old" });
    const item = await addWishlistItem(userA, { name: "Pen", estimatedPrice: 2, category: "old" });
    const ren = succeeded(await renameCategoryAction({ scope: "wishlist", from: "old", to: "new" }));
    const undo = { scope: "wishlist", name: "old", current: "new", dropCurrent: !ren.change.merged, ...ren.change };

    const userB = await owner();
    expect(await revertCategoryAction(undo)).toEqual({ success: false, error: `Can't undo: "new" has changed since.` });
    expect(await names(userB, "wishlist")).toEqual([]);
    expect(await names(userA, "wishlist")).toEqual(["new"]);

    authState.id = userA;
    expect(await revertCategoryAction(undo)).toEqual({ success: true, keptCurrent: false });
    expect(await names(userA, "wishlist")).toEqual(["old"]);
    expect((await getWishlist(userA)).find((i) => i.id === item.id)?.category).toBe("old");
  });

  it("Undo of a delete puts the category back at its old place and moves the ones from there down by one", async () => {
    const userA = await owner();
    for (const name of ["a", "b", "c"]) await addCategoryAction({ scope: "business", name });
    const del = succeeded(await deleteCategoryAction({ scope: "business", name: "b" }));
    // Moving a category closes the gap, so another one now holds b's old place.
    succeeded(await reorderCategoriesAction({ scope: "business", names: ["a", "c"] }));
    expect(await rows(userA, "business")).toEqual([
      { name: "a", sortOrder: 1 },
      { name: "c", sortOrder: 2 },
    ]);

    succeeded(await revertCategoryAction({ scope: "business", name: "b", current: "other", dropCurrent: false, ...del.change }));
    expect(await rows(userA, "business")).toEqual([
      { name: "a", sortOrder: 1 },
      { name: "b", sortOrder: 2 },
      { name: "c", sortOrder: 3 },
    ]);
  });

  it("a stale Undo of a rename, after the new name was renamed or deleted again, changes nothing and leaves no orphan", async () => {
    const userA = await owner();
    await addCategoryAction({ scope: "wishlist", name: "books" });
    const item = await addWishlistItem(userA, { name: "Novel", estimatedPrice: 10, category: "books" });
    const catOf = async () => (await getWishlist(userA)).find((i) => i.id === item.id)?.category;

    const first = succeeded(await renameCategoryAction({ scope: "wishlist", from: "books", to: "reading" }));
    succeeded(await renameCategoryAction({ scope: "wishlist", from: "reading", to: "novels" }));
    const stale = { scope: "wishlist", name: "books", current: "reading", dropCurrent: !first.change.merged, ...first.change };
    expect(await revertCategoryAction(stale)).toEqual({ success: false, error: `Can't undo: "reading" has changed since.` });
    expect(await names(userA, "wishlist")).toEqual(["novels"]);
    expect(await catOf()).toBe("novels");

    const second = succeeded(await renameCategoryAction({ scope: "wishlist", from: "novels", to: "shelf" }));
    succeeded(await deleteCategoryAction({ scope: "wishlist", name: "shelf" }));
    expect(
      await revertCategoryAction({ scope: "wishlist", name: "novels", current: "shelf", dropCurrent: !second.change.merged, ...second.change }),
    ).toEqual({ success: false, error: `Can't undo: "shelf" has changed since.` });
    expect(await names(userA, "wishlist")).toEqual([]);
    expect(await catOf()).toBe("other");
  });

  it("Undo of a rename keeps the new name when an item was filed under it since, so no item loses its category", async () => {
    const userA = await owner();
    await addCategoryAction({ scope: "wishlist", name: "tools" });
    const moved = await addWishlistItem(userA, { name: "Saw", estimatedPrice: 15, category: "tools" });
    const ren = succeeded(await renameCategoryAction({ scope: "wishlist", from: "tools", to: "gear" }));
    const added = await addWishlistItem(userA, { name: "Rope", estimatedPrice: 8, category: "gear" });

    expect(await revertCategoryAction({ scope: "wishlist", name: "tools", current: "gear", dropCurrent: !ren.change.merged, ...ren.change })).toEqual({
      success: true,
      keptCurrent: true,
    });
    const catOf = async (id: string) => (await getWishlist(userA)).find((i) => i.id === id)?.category;
    expect(await catOf(moved.id)).toBe("tools");
    expect(await catOf(added.id)).toBe("gear");
    expect(await names(userA, "wishlist")).toEqual(["tools", "gear"]);
  });
});

