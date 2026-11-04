"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { addWishlistItem, deleteWishlistItem } from "@/lib/wishlist";
import { CreateWishlistItemInput, createWishlistItemSchema } from "@/lib/validations/wishlist";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // No-op in test runner
  }
}

export async function addWishlistItemAction(rawInput: CreateWishlistItemInput) {
  const userId = await requireUser();
  const validated = createWishlistItemSchema.parse(rawInput);
  const item = await addWishlistItem(userId, validated);
  safeRevalidate("/wishlist");
  return { success: true, item };
}

export async function deleteWishlistItemAction(itemId: string) {
  const userId = await requireUser();
  if (!itemId || typeof itemId !== "string") {
    throw new Error("Invalid item ID");
  }
  const deleted = await deleteWishlistItem(userId, itemId);
  safeRevalidate("/wishlist");
  return { success: true, deleted };
}
