"use server";

import { requireUser } from "@/server/auth";
import { uuid } from "@/lib/validations/common";
import { Refusal, respond } from "@/lib/validations/result";
import { addWishlistItem, deleteWishlistItem, restoreWishlistItem, updateWishlistItem } from "@/lib/wishlist";
import {
  AddWishlistItemInput,
  addWishlistItemSchema,
  RestoreWishlistItemInput,
  restoreWishlistItemSchema,
  UpdateWishlistItemInput,
  updateWishlistItemSchema,
  WISHLIST_ITEM_GONE,
} from "@/lib/validations/wishlist";

const gone = () => new Refusal(WISHLIST_ITEM_GONE);

/**
 * Adds an item; a repeat of the same add (same id) answers the item already there with `repeated`, an id another user
 * holds is refused.
 */
export async function addWishlistItemAction(rawInput: AddWishlistItemInput) {
  return respond(async () => {
    const userId = await requireUser();
    const { item, repeated } = await addWishlistItem(userId, addWishlistItemSchema.parse(rawInput));
    if (!item) throw new Refusal("This item could not be saved.");
    return { item, repeated };
  });
}

/** Changes only the fields the edit sent (D-040). */
export async function updateWishlistItemAction(itemId: string, rawInput: UpdateWishlistItemInput) {
  return respond(async () => {
    const userId = await requireUser();
    const item = await updateWishlistItem(userId, uuid.parse(itemId), updateWishlistItemSchema.parse(rawInput));
    if (!item) throw gone();
    return { item };
  });
}

/** An item that is not there (deleted elsewhere, or another user's) is refused, so the screen says so. */
export async function deleteWishlistItemAction(itemId: string) {
  return respond(async () => {
    const userId = await requireUser();
    if (!(await deleteWishlistItem(userId, uuid.parse(itemId)))) throw gone();
    return {};
  });
}

export async function restoreWishlistItemAction(rawInput: RestoreWishlistItemInput) {
  return respond(async () => {
    const userId = await requireUser();
    const item = await restoreWishlistItem(userId, restoreWishlistItemSchema.parse(rawInput));
    if (!item) throw new Refusal("Item could not be restored.");
    return { item };
  });
}
