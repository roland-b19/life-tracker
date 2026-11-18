import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", async () => (await import("./auth")).authModule);
import { authState, seedUser } from "./auth";
import {
  addWishlistItem,
  deleteWishlistItem,
  getWishlist,
  restoreWishlistItem,
  updateWishlistItem,
} from "@/lib/wishlist";
import { addWishlistItemAction, deleteWishlistItemAction, restoreWishlistItemAction, updateWishlistItemAction } from "@/actions/wishlist";
import { priorityForPrice } from "@/lib/rules";
import { succeeded } from "./succeeded";

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
    });

    const item2 = await addWishlistItem(userA, {
      name: "Mechanical Keyboard",
      url: null,
      estimatedPrice: 450,
    });

    expect(item1.id).toBeDefined();
    expect(item1.name).toBe("Ergonomic Office Chair");
    expect(Number(item1.estimatedPrice)).toBe(1200.5);
    expect(item2.id).toBeDefined();

    const list = await getWishlist(userA);
    expect(list.length).toBe(2);
  });

  it("enforces multi-user isolation on wishlist", async () => {
    const itemA = await addWishlistItem(userA, {
      name: "User A Secret Gadget",
      estimatedPrice: 300,
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

  it("lets the owner edit an item but not another user", async () => {
    const item = await addWishlistItem(userA, {
      name: "Desk Lamp",
      estimatedPrice: 80,
    });
    const edit = { name: "Desk Lamp Pro", estimatedPrice: 99.9 };

    expect(await updateWishlistItem(userB, item.id, edit)).toBeNull();
    const unchanged = (await getWishlist(userA)).find((i) => i.id === item.id);
    expect(unchanged?.name).toBe("Desk Lamp");

    const updated = await updateWishlistItem(userA, item.id, edit);
    expect(updated?.name).toBe("Desk Lamp Pro");
    expect(Number(updated?.estimatedPrice)).toBe(99.9);
    expect(updated?.priority).toBe("low");
  });

  it("derives the priority from the price", () => {
    expect([0.01, 249.99, 250, 749.99, 750, 5000].map(priorityForPrice)).toEqual([
      "low", "low", "medium", "medium", "high", "high",
    ]);
  });

  it("derives the priority from the price as stored (cents), not from the raw number", async () => {
    const edge = await addWishlistItem(userA, { name: "Edge", estimatedPrice: 249.999 });
    expect(edge.estimatedPrice).toBe("250.00");
    expect(edge.priority).toBe("medium");
    const high = await addWishlistItem(userA, { name: "Edge high", estimatedPrice: "749.996" as unknown as number });
    expect([high.estimatedPrice, high.priority]).toEqual(["750.00", "high"]);
    expect((await addWishlistItem(userA, { name: "Floor", estimatedPrice: 0.0149 })).estimatedPrice).toBe("0.01");
  });

  it("rejects names that are only spaces and trims the rest", async () => {
    await expect(addWishlistItem(userA, { name: "   ", estimatedPrice: 10 })).rejects.toThrow();
    expect((await addWishlistItem(userA, { name: "  Lamp  ", estimatedPrice: 10 })).name).toBe("Lamp");
    await expect(addWishlistItem(userA, { name: "x".repeat(121), estimatedPrice: 10 })).rejects.toThrow();
    expect((await addWishlistItem(userA, { name: "x".repeat(120), estimatedPrice: 10 })).name).toHaveLength(120);
  });

  it("accepts any text as a link", async () => {
    const item = await addWishlistItem(userA, { name: "Lamp", url: "emag", estimatedPrice: 50 });
    expect(item.url).toBe("emag");
  });

  it("rejects invalid input and negative prices", async () => {
    await expect(
      addWishlistItem(userA, {
        name: "",
        estimatedPrice: 100,
      }),
    ).rejects.toThrow();

    await expect(
      addWishlistItem(userA, {
        name: "Negative item",
        estimatedPrice: -50,
      }),
    ).rejects.toThrow();
  });

  it("updates an item for the owner only", async () => {
    const item = await addWishlistItem(userA, { name: "Monitor", estimatedPrice: 300 });
    const edit = { name: "Monitor 4K", estimatedPrice: 350 };
    authState.id = userB;
    expect(await updateWishlistItemAction(item.id, edit)).toEqual({ success: false, error: "Item not found." });
    authState.id = "";
    await expect(updateWishlistItemAction(item.id, edit)).rejects.toThrow();
    expect((await getWishlist(userA)).find((i) => i.id === item.id)?.name).toBe("Monitor");
    authState.id = userA;
    expect((await updateWishlistItemAction(item.id, edit)).success).toBe(true);
    expect((await getWishlist(userA)).find((i) => i.id === item.id)?.name).toBe("Monitor 4K");
    authState.id = "";
  });

  it("rejects a price that rounds to zero and a malformed id", async () => {
    authState.id = userA;
    expect(await addWishlistItemAction({ name: "Tiny", estimatedPrice: 0.004 })).toMatchObject({ success: false, error: expect.any(String) });
    expect(await deleteWishlistItemAction("nope")).toEqual({ success: false, error: "Invalid id" });
  });

  it("restores a deleted item with its id and date, for the owner only", async () => {
    const item = await addWishlistItem(userA, { name: "Headphones", estimatedPrice: 600 });
    const input = { name: item.name, estimatedPrice: 600, id: item.id, createdAt: item.createdAt };

    // Anonymous is rejected before anything is written.
    authState.id = "";
    await expect(restoreWishlistItemAction(input)).rejects.toThrow();

    // While the row exists another user cannot take its id.
    authState.id = userB;
    expect(await restoreWishlistItemAction(input)).toEqual({ success: false, error: "Item could not be restored." });
    expect((await getWishlist(userB)).find((i) => i.id === item.id)).toBeUndefined();

    await deleteWishlistItem(userA, item.id);
    authState.id = userA;
    const back = succeeded(await restoreWishlistItemAction(input));
    expect(back.item.id).toBe(item.id);
    expect(back.item.createdAt.getTime()).toBe(item.createdAt.getTime());
    expect((await getWishlist(userA)).find((i) => i.id === item.id)?.priority).toBe("medium");

    // A second restore of a live row is a no-op.
    expect(await restoreWishlistItem(userA, input)).toBeNull();
    authState.id = "";
  });

  it("rejects a restore with a bad id or a future date", async () => {
    const base = { name: "X", estimatedPrice: 10 };
    await expect(restoreWishlistItem(userA, { ...base, id: "nope", createdAt: new Date() })).rejects.toThrow();
    await expect(
      restoreWishlistItem(userA, { ...base, id: randomUUID(), createdAt: new Date(Date.now() + 86_400_000) }),
    ).rejects.toThrow();
  });
});
