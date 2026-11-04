import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { wishlistItems } from "@/db/schema";
import { CreateWishlistItemInput, createWishlistItemSchema } from "./validations/wishlist";

export interface WishlistItemData {
  id: string;
  name: string;
  url: string | null;
  estimatedPrice: string;
  priority: "low" | "medium" | "high";
  createdAt: Date;
}

export async function getWishlist(userId: string): Promise<WishlistItemData[]> {
  const items = await db
    .select({
      id: wishlistItems.id,
      name: wishlistItems.name,
      url: wishlistItems.url,
      estimatedPrice: wishlistItems.estimatedPrice,
      priority: wishlistItems.priority,
      createdAt: wishlistItems.createdAt,
    })
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
      priority: validated.priority,
    })
    .returning({
      id: wishlistItems.id,
      name: wishlistItems.name,
      url: wishlistItems.url,
      estimatedPrice: wishlistItems.estimatedPrice,
      priority: wishlistItems.priority,
      createdAt: wishlistItems.createdAt,
    });

  return item as WishlistItemData;
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

export async function getWishlistStats(userId: string): Promise<{
  totalItems: number;
  totalEstimatedCost: number;
}> {
  const [result] = await db
    .select({
      totalItems: sql<number>`count(*)::int`,
      totalCost: sql<number>`coalesce(sum(${wishlistItems.estimatedPrice}), 0)::float`,
    })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId));

  return {
    totalItems: result?.totalItems ?? 0,
    totalEstimatedCost: result?.totalCost ?? 0,
  };
}
