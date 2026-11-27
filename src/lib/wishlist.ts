import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { wishlistItems } from "@/db/schema";
import { ensureCategory } from "./categories";
import {
  AddWishlistItemInput,
  RestoreWishlistItemInput,
  UpdateWishlistItemInput,
} from "./validations/wishlist";
import { priorityForPrice } from "./rules";

const wishlistColumns = {
  id: wishlistItems.id,
  name: wishlistItems.name,
  url: wishlistItems.url,
  estimatedPrice: wishlistItems.estimatedPrice,
  priority: wishlistItems.priority,
  category: wishlistItems.category,
  createdAt: wishlistItems.createdAt,
};

export interface WishlistItemData {
  id: string;
  name: string;
  url: string | null;
  estimatedPrice: string;
  priority: "low" | "medium" | "high";
  category: string;
  createdAt: Date;
}

export async function getWishlist(userId: string): Promise<WishlistItemData[]> {
  const items = await db
    .select(wishlistColumns)
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId))
    .orderBy(desc(wishlistItems.createdAt));

  return items as WishlistItemData[];
}

/**
 * Adds an item under the id the device made, when it sent one: a repeat of the same add finds the row already there and
 * answers it, with `repeated`. An id another user's item holds writes nothing and answers a null item, so it neither
 * changes nor shows that row.
 */
export async function addWishlistItem(
  userId: string,
  input: AddWishlistItemInput,
): Promise<{ item: WishlistItemData | null; repeated: boolean }> {
  const [item] = await db
    .insert(wishlistItems)
    .values({
      id: input.id,
      userId,
      name: input.name,
      url: input.url || null,
      estimatedPrice: String(input.estimatedPrice),
      priority: priorityForPrice(input.estimatedPrice),
      category: input.category,
    })
    .onConflictDoNothing()
    .returning(wishlistColumns);

  if (item) {
    await ensureCategory(userId, "wishlist", input.category);
    return { item: item as WishlistItemData, repeated: false };
  }
  if (!input.id) return { item: null, repeated: false };
  const own = await findWishlistItem(userId, input.id);
  return { item: own, repeated: own !== null };
}

/** The user's item, or null. */
async function findWishlistItem(userId: string, itemId: string): Promise<WishlistItemData | null> {
  const [own] = await db
    .select(wishlistColumns)
    .from(wishlistItems)
    .where(and(eq(wishlistItems.id, itemId), eq(wishlistItems.userId, userId)));
  return (own as WishlistItemData | undefined) ?? null;
}

/**
 * Puts a deleted item back with its old id and creation time. An id that is already taken
 * (by this or another user) is left alone and returns null.
 */
export async function restoreWishlistItem(
  userId: string,
  input: RestoreWishlistItemInput,
): Promise<WishlistItemData | null> {
  const [item] = await db
    .insert(wishlistItems)
    .values({
      id: input.id,
      userId,
      name: input.name,
      url: input.url || null,
      estimatedPrice: String(input.estimatedPrice),
      priority: priorityForPrice(input.estimatedPrice),
      category: input.category,
      createdAt: input.createdAt,
    })
    .onConflictDoNothing()
    .returning(wishlistColumns);

  if (item) await ensureCategory(userId, "wishlist", input.category);
  return (item as WishlistItemData | undefined) ?? null;
}

/**
 * Edits an item in place: only the fields the edit sent (the ones it changed, D-040), so another tab's change to another
 * field stays. A new price brings its priority. Null when the item is not the user's.
 */
export async function updateWishlistItem(userId: string, input: UpdateWishlistItemInput): Promise<WishlistItemData | null> {
  const { id: itemId, ...fields } = input;
  const changes = {
    ...(fields.name !== undefined && { name: fields.name }),
    ...(fields.url !== undefined && { url: fields.url || null }),
    ...(fields.estimatedPrice !== undefined && {
      estimatedPrice: String(fields.estimatedPrice),
      priority: priorityForPrice(fields.estimatedPrice),
    }),
    ...(fields.category !== undefined && { category: fields.category }),
  };
  if (Object.keys(changes).length === 0) return findWishlistItem(userId, itemId);

  const [item] = await db
    .update(wishlistItems)
    .set(changes)
    .where(and(eq(wishlistItems.id, itemId), eq(wishlistItems.userId, userId)))
    .returning(wishlistColumns);

  if (item && fields.category) await ensureCategory(userId, "wishlist", fields.category);
  return (item as WishlistItemData | undefined) ?? null;
}

export async function deleteWishlistItem(
  userId: string,
  itemId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(wishlistItems)
    .where(
      and(
        eq(wishlistItems.id, itemId),
        eq(wishlistItems.userId, userId),
      ),
    )
    .returning({ id: wishlistItems.id });

  return deleted.length > 0;
}
