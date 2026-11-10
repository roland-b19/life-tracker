"use server";

import { requireUser } from "@/server/auth";
import { addWishlistItem, deleteWishlistItem, restoreWishlistItem, updateWishlistItem } from "@/lib/wishlist";
import { CreateWishlistItemInput, createWishlistItemSchema, RestoreWishlistItemInput } from "@/lib/validations/wishlist";

export async function addWishlistItemAction(rawInput: CreateWishlistItemInput) {
  const userId = await requireUser();
  const validated = createWishlistItemSchema.parse(rawInput);
  const item = await addWishlistItem(userId, validated);
  return { success: true, item };
}

export async function updateWishlistItemAction(itemId: string, rawInput: CreateWishlistItemInput) {
  const userId = await requireUser();
  if (!itemId || typeof itemId !== "string") {
    throw new Error("Invalid item ID");
  }
  const validated = createWishlistItemSchema.parse(rawInput);
  const item = await updateWishlistItem(userId, itemId, validated);
  return { success: item !== null, item };
}

export async function deleteWishlistItemAction(itemId: string) {
  const userId = await requireUser();
  if (!itemId || typeof itemId !== "string") {
    throw new Error("Invalid item ID");
  }
  const deleted = await deleteWishlistItem(userId, itemId);
  return { success: true, deleted };
}

export async function restoreWishlistItemAction(rawInput: RestoreWishlistItemInput) {
  const userId = await requireUser();
  const item = await restoreWishlistItem(userId, rawInput);
  return { success: item !== null, item };
}
