import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { wishlistItems } from "@/db/schema";
import { ensureCategory } from "./categories";
import {
  CreateWishlistItemInput,
  createWishlistItemSchema,
  RestoreWishlistItemInput,
  restoreWishlistItemSchema,
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

export async function addWishlistItem(
  userId: string,
  rawInput: CreateWishlistItemInput,
): Promise<WishlistItemData> {
  const validated = createWishlistItemSchema.parse(rawInput);

  const [item] = await db
    .insert(wishlistItems)
    .values({
      userId,
      name: validated.name,
      url: validated.url || null,
      estimatedPrice: String(validated.estimatedPrice),
      priority: priorityForPrice(validated.estimatedPrice),
      category: validated.category,
    })
    .returning(wishlistColumns);

  await ensureCategory(userId, "wishlist", validated.category);
  return item as WishlistItemData;
}

/**
 * Puts a deleted item back with its old id and creation time. An id that is already taken
 * (by this or another user) is left alone and returns null.
 */
export async function restoreWishlistItem(
  userId: string,
  rawInput: RestoreWishlistItemInput,
): Promise<WishlistItemData | null> {
  const validated = restoreWishlistItemSchema.parse(rawInput);

  const [item] = await db
    .insert(wishlistItems)
    .values({
      id: validated.id,
      userId,
      name: validated.name,
      url: validated.url || null,
      estimatedPrice: String(validated.estimatedPrice),
      priority: priorityForPrice(validated.estimatedPrice),
      category: validated.category,
      createdAt: validated.createdAt,
    })
    .onConflictDoNothing()
    .returning(wishlistColumns);

  if (item) await ensureCategory(userId, "wishlist", validated.category);
  return (item as WishlistItemData | undefined) ?? null;
}

export async function updateWishlistItem(
  userId: string,
  itemId: string,
  rawInput: CreateWishlistItemInput,
): Promise<WishlistItemData | null> {
  const validated = createWishlistItemSchema.parse(rawInput);

  const [item] = await db
    .update(wishlistItems)
    .set({
      name: validated.name,
      url: validated.url || null,
      estimatedPrice: String(validated.estimatedPrice),
      priority: priorityForPrice(validated.estimatedPrice),
      category: validated.category,
    })
    .where(and(eq(wishlistItems.id, itemId), eq(wishlistItems.userId, userId)))
    .returning(wishlistColumns);

  if (item) await ensureCategory(userId, "wishlist", validated.category);
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
