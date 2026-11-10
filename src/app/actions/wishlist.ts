"use server";

import { requireUser } from "@/server/auth";
import { uuid } from "@/lib/validations/common";
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
  const validated = createWishlistItemSchema.parse(rawInput);
  const item = await updateWishlistItem(userId, uuid.parse(itemId), validated);
  return { success: item !== null, item };
}

export async function deleteWishlistItemAction(itemId: string) {
  const userId = await requireUser();
  const deleted = await deleteWishlistItem(userId, uuid.parse(itemId));
  return { success: true, deleted };
}

export async function restoreWishlistItemAction(rawInput: RestoreWishlistItemInput) {
  const userId = await requireUser();
  const item = await restoreWishlistItem(userId, rawInput);
  return { success: item !== null, item };
}
