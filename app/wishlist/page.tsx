import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { getCategories } from "@/lib/categories";
import { getWishlist } from "@/lib/wishlist";
import { WishlistClient } from "./wishlist-client";

export default async function WishlistPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const [items, { wishlist }] = await Promise.all([getWishlist(userId), getCategories(userId, ["wishlist"])]);

  return (
    <WishlistClient
      userName={session.user.name ?? "User"}
      initialItems={items}
      initialCategories={wishlist}
    />
  );
}
