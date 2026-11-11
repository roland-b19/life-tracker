import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { itemCategories, todos, wishlistItems } from "@/db/schema";
import type { CategoryScope } from "./validations/categories";

const own = (userId: string, scope: CategoryScope, name: string) =>
  and(eq(itemCategories.userId, userId), eq(itemCategories.scope, scope), eq(itemCategories.name, name));

/** Re-files every item of the user's list from one category to another, history included. */
function moveItems(tx: Pick<typeof db, "update">, userId: string, scope: CategoryScope, from: string, to: string) {
  return scope === "wishlist"
    ? tx
        .update(wishlistItems)
        .set({ category: to })
        .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.category, from)))
    : tx
        .update(todos)
        .set({ category: to })
        .where(and(eq(todos.userId, userId), eq(todos.space, scope), eq(todos.category, from)));
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

/** Renames a category on all the list's items; renaming onto an existing one merges the two. */
export async function renameCategory(userId: string, scope: CategoryScope, from: string, to: string) {
  return db.transaction(async (tx) => {
    const [old] = await tx.delete(itemCategories).where(own(userId, scope, from)).returning();
    if (!old) return false;
    await tx.insert(itemCategories).values({ userId, scope, name: to, sortOrder: old.sortOrder }).onConflictDoNothing();
    await moveItems(tx, userId, scope, from, to);
    return true;
  });
}

/** Deletes a category; its items move to "other". */
export async function deleteCategory(userId: string, scope: CategoryScope, name: string) {
  return db.transaction(async (tx) => {
    const [old] = await tx.delete(itemCategories).where(own(userId, scope, name)).returning();
    if (!old) return false;
    await moveItems(tx, userId, scope, name, "other");
    return true;
  });
}
