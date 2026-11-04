import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { users } from "@/db/schema";
import { addWishlistItem, deleteWishlistItem, getWishlist, getWishlistStats } from "@/lib/wishlist";

async function seedUser(subject: string) {
  const [user] = await db
    .insert(users)
    .values({ issuer: "test", subject })
    .returning({ id: users.id });
  return user.id;
}

describe("Wishlist Module: Data Access & Multi-User Isolation", () => {
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    userA = await seedUser(`wishlist-userA-${randomUUID()}`);
    userB = await seedUser(`wishlist-userB-${randomUUID()}`);
  });

  it("allows user to add items to wishlist and query stats", async () => {
    const item1 = await addWishlistItem(userA, {
      name: "Ergonomic Office Chair",
      url: "https://example.com/chair",
      estimatedPrice: 1200.5,
      priority: "high",
    });

    const item2 = await addWishlistItem(userA, {
      name: "Mechanical Keyboard",
      url: null,
      estimatedPrice: 450,
      priority: "medium",
    });

    expect(item1.id).toBeDefined();
    expect(item1.name).toBe("Ergonomic Office Chair");
    expect(Number(item1.estimatedPrice)).toBe(1200.5);
    expect(item2.id).toBeDefined();

    const list = await getWishlist(userA);
    expect(list.length).toBe(2);

    const stats = await getWishlistStats(userA);
    expect(stats.totalItems).toBe(2);
    expect(stats.totalEstimatedCost).toBe(1650.5);
  });

  it("enforces multi-user isolation on wishlist", async () => {
    const itemA = await addWishlistItem(userA, {
      name: "User A Secret Gadget",
      estimatedPrice: 300,
      priority: "low",
    });

    // User B should not see User A's item
    const listB = await getWishlist(userB);
    expect(listB.find((i) => i.id === itemA.id)).toBeUndefined();

    // User B cannot delete User A's item
    const deletedByB = await deleteWishlistItem(userB, itemA.id);
    expect(deletedByB).toBe(false);

    // Item should still exist for User A
    const listAAfter = await getWishlist(userA);
    expect(listAAfter.find((i) => i.id === itemA.id)).toBeDefined();

    // User A can delete their own item
    const deletedByA = await deleteWishlistItem(userA, itemA.id);
    expect(deletedByA).toBe(true);
  });

  it("rejects invalid input and negative prices", async () => {
    await expect(
      addWishlistItem(userA, {
        name: "",
        estimatedPrice: 100,
        priority: "medium",
      }),
    ).rejects.toThrow();

    await expect(
      addWishlistItem(userA, {
        name: "Negative item",
        estimatedPrice: -50,
        priority: "medium",
      }),
    ).rejects.toThrow();

    await expect(
      addWishlistItem(userA, {
        name: "Invalid URL item",
        url: "not-a-valid-url",
        estimatedPrice: 50,
        priority: "medium",
      }),
    ).rejects.toThrow();
  });
});
