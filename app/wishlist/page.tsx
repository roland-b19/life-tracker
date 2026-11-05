import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { getWishlist } from "@/lib/wishlist";
import { WishlistClient } from "./wishlist-client";

export default async function WishlistPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const items = await getWishlist(userId);

  return (
    <WishlistClient
      userName={session.user.name ?? "User"}
      initialItems={items}
    />
  );
}
