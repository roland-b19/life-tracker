import { getCategories } from "@/lib/categories";
import { getWishlist } from "@/lib/wishlist";
import { requirePageUser } from "@/server/auth";
import { WishlistClient } from "./wishlist-client";

export default async function WishlistPage() {
  const user = await requirePageUser();

  const [items, { wishlist }] = await Promise.all([getWishlist(user.id), getCategories(user.id, ["wishlist"])]);

  return (
    <WishlistClient
      userName={user.name}
      initialItems={items}
      initialCategories={wishlist}
    />
  );
}
