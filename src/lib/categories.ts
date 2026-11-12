import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { itemCategories, todos, wishlistItems } from "@/db/schema";
import type { CategoryScope } from "./validations/categories";
import { blockPlacements } from "./todo-order";

const own = (userId: string, scope: CategoryScope, name: string) =>
  and(eq(itemCategories.userId, userId), eq(itemCategories.scope, scope), eq(itemCategories.name, name));

/**
 * Re-filed repeating tasks land on top of their new category as one block, in the order they had (only the daily
 * list shows categories, so one-off tasks keep their place). Returns the new placement of a task and the old ones,
 * which Undo puts back.
 */
function liftedPlacement(rows: { id: string; placedAt: Date }[]) {
  const placed = blockPlacements(rows);
  return {
    place: (t: { id: string }) => placed.get(t.id)!,
    before: rows.map((r) => ({ id: r.id, placedAt: r.placedAt.toISOString() })),
  };
}

/** Re-files every item of the user's list from one category to another, history included. */
async function moveItems(tx: Pick<typeof db, "update" | "select">, userId: string, scope: CategoryScope, from: string, to: string) {
  if (scope === "wishlist") {
    const rows = await tx
      .update(wishlistItems)
      .set({ category: to })
      .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.category, from)))
      .returning({ id: wishlistItems.id });
    return { itemIds: rows.map((r) => r.id), before: [] };
  }
  const rows = await tx.select().from(todos).where(and(eq(todos.userId, userId), eq(todos.space, scope), eq(todos.category, from)));
  const { before, place } = liftedPlacement(rows.filter((t) => t.isRecurring));
  for (const t of rows) await tx.update(todos).set(t.isRecurring ? { category: to, placedAt: place(t) } : { category: to }).where(eq(todos.id, t.id));
  return { itemIds: rows.map((r) => r.id), before };
}

/** Adds a category at the end of the list unless it is there already or is the built-in "other". */
export async function ensureCategory(userId: string, scope: CategoryScope, name: string) {
  if (name === "other") return;
  await db
    .insert(itemCategories)
    .values({
      userId,
      scope,
      name,
      sortOrder: sql`(select coalesce(max(${itemCategories.sortOrder}), 0) + 1 from ${itemCategories} where ${itemCategories.userId} = ${userId} and ${itemCategories.scope} = ${scope})`,
    })
    .onConflictDoNothing();
}

/** The user's categories per list, in order, without "other". One query for any number of lists. */
export async function getCategories<S extends CategoryScope>(userId: string, scopes: S[]) {
  const rows = await db
    .select({ scope: itemCategories.scope, name: itemCategories.name })
    .from(itemCategories)
    .where(and(eq(itemCategories.userId, userId), inArray(itemCategories.scope, scopes)))
    .orderBy(asc(itemCategories.sortOrder), asc(itemCategories.name));
  const byScope = Object.fromEntries(scopes.map((s) => [s, [] as string[]])) as Record<S, string[]>;
  for (const r of rows) byScope[r.scope as S].push(r.name);
  return byScope;
}

/** Returns false when the user already has a category with that name. */
export async function addCategory(userId: string, scope: CategoryScope, name: string) {
  const [existing] = await db.select().from(itemCategories).where(own(userId, scope, name));
  if (existing) return false;
  await ensureCategory(userId, scope, name);
  return true;
}

/** What a rename or delete changed, so Undo can put back exactly that. */
export interface CategoryChange {
  sortOrder: number;
  itemIds: string[];
  /** The rename landed on a category that already existed, so Undo must not delete it. */
  merged: boolean;
  /** The places the repeating tasks had before they were put on top of their new category; Undo puts them back. */
  before?: { id: string; placedAt: string }[];
}

/** Renames a category on all the list's items; renaming onto an existing one merges the two. */
export async function renameCategory(userId: string, scope: CategoryScope, from: string, to: string) {
  return db.transaction(async (tx): Promise<CategoryChange | null> => {
    const [old] = await tx.delete(itemCategories).where(own(userId, scope, from)).returning();
    if (!old) return null;
    const created = await tx
      .insert(itemCategories)
      .values({ userId, scope, name: to, sortOrder: old.sortOrder })
      .onConflictDoNothing()
      .returning();
    return { sortOrder: old.sortOrder, ...(await moveItems(tx, userId, scope, from, to)), merged: created.length === 0 };
  });
}

/** Deletes a category; its items move to "other". */
export async function deleteCategory(userId: string, scope: CategoryScope, name: string) {
  return db.transaction(async (tx): Promise<CategoryChange | null> => {
    const [old] = await tx.delete(itemCategories).where(own(userId, scope, name)).returning();
    if (!old) return null;
    return { sortOrder: old.sortOrder, merged: false, ...(await moveItems(tx, userId, scope, name, "other")) };
  });
}

/**
 * Undoes a rename or delete: the category comes back at its old place and exactly the items that were moved are
 * re-filed from `current` ("other" after a delete, the new name after a rename). An item the user has moved
 * since stays where it is. A rename that created `current` removes that category again.
 */
export async function revertCategory(
  userId: string,
  scope: CategoryScope,
  input: { name: string; current: string; sortOrder: number; itemIds: string[]; dropCurrent: boolean; before?: { id: string; placedAt: string }[] },
) {
  const { name, current, sortOrder, dropCurrent, itemIds, before = [] } = input;
  await db.transaction(async (tx) => {
    await tx.insert(itemCategories).values({ userId, scope, name, sortOrder }).onConflictDoNothing();
    if (itemIds.length > 0) {
      if (scope === "wishlist")
        await tx
          .update(wishlistItems)
          .set({ category: name })
          .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.category, current), inArray(wishlistItems.id, itemIds)));
      else
        await tx
          .update(todos)
          .set({ category: name })
          .where(and(eq(todos.userId, userId), eq(todos.space, scope), eq(todos.category, current), inArray(todos.id, itemIds)));
      for (const b of before)
        if (itemIds.includes(b.id))
          await tx.update(todos).set({ placedAt: new Date(b.placedAt) }).where(and(eq(todos.id, b.id), eq(todos.userId, userId), eq(todos.space, scope), eq(todos.category, name)));
    }
    if (dropCurrent && current !== "other") await tx.delete(itemCategories).where(own(userId, scope, current));
  });
}

/** Puts the user's categories of a list in the given order, top first; names that are not theirs change nothing. */
export async function reorderCategories(userId: string, scope: CategoryScope, names: string[]) {
  await db.transaction(async (tx) => {
    for (const [i, name] of names.entries()) await tx.update(itemCategories).set({ sortOrder: i + 1 }).where(own(userId, scope, name));
  });
}
