"use server";

import { requireUser } from "@/server/auth";
import { uuid } from "@/lib/validations/common";
import { Refusal, respond } from "@/lib/validations/result";
import { addWishlistItem, deleteWishlistItem, restoreWishlistItem, updateWishlistItem } from "@/lib/wishlist";
import { AddWishlistItemInput, addWishlistItemSchema, RestoreWishlistItemInput, restoreWishlistItemSchema } from "@/lib/validations/wishlist";

export async function addWishlistItemAction(rawInput: AddWishlistItemInput) {
  const userId = await requireUser();
  return respond(async () => ({ item: await addWishlistItem(userId, addWishlistItemSchema.parse(rawInput)) }));
}

export async function updateWishlistItemAction(itemId: string, rawInput: AddWishlistItemInput) {
  const userId = await requireUser();
  return respond(async () => {
    const item = await updateWishlistItem(userId, uuid.parse(itemId), addWishlistItemSchema.parse(rawInput));
    if (!item) throw new Refusal("Item not found.");
    return { item };
  });
}

export async function deleteWishlistItemAction(itemId: string) {
  const userId = await requireUser();
  return respond(async () => ({ deleted: await deleteWishlistItem(userId, uuid.parse(itemId)) }));
}

export async function restoreWishlistItemAction(rawInput: RestoreWishlistItemInput) {
  const userId = await requireUser();
  return respond(async () => {
    const item = await restoreWishlistItem(userId, restoreWishlistItemSchema.parse(rawInput));
    if (!item) throw new Refusal("Item could not be restored.");
    return { item };
  });
}
