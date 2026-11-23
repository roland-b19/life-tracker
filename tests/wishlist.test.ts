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
import { refused, succeeded } from "./succeeded";
import { SIGNED_OUT } from "@/lib/validations/result";

// The item an add made (tests that look at a repeated add call addWishlistItem itself).
const add = async (userId: string, input: Parameters<typeof addWishlistItem>[1]) => (await addWishlistItem(userId, input)).item!;

describe("Wishlist Module: Data Access & Multi-User Isolation", () => {
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    userA = await seedUser(`wishlist-userA-${randomUUID()}`);
    userB = await seedUser(`wishlist-userB-${randomUUID()}`);
  });

  it("allows user to add items to wishlist and query stats", async () => {
    const item1 = await add(userA, {
      name: "Ergonomic Office Chair",
      url: "https://example.com/chair",
      estimatedPrice: 1200.5,
    });

    const item2 = await add(userA, {
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
    const itemA = await add(userA, {
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
    const item = await add(userA, {
      name: "Desk Lamp",
      estimatedPrice: 80,
    });
    const edit = { name: "Desk Lamp Pro", estimatedPrice: 99.9 };

    expect(await updateWishlistItem(userB, { id: item.id, ...edit })).toBeNull();
    const unchanged = (await getWishlist(userA)).find((i) => i.id === item.id);
    expect(unchanged?.name).toBe("Desk Lamp");

    const updated = await updateWishlistItem(userA, { id: item.id, ...edit });
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
    const edge = await add(userA, { name: "Edge", estimatedPrice: 249.999 });
    expect(edge.estimatedPrice).toBe("250.00");
    expect(edge.priority).toBe("medium");
    const high = await add(userA, { name: "Edge high", estimatedPrice: "749.996" as unknown as number });
    expect([high.estimatedPrice, high.priority]).toEqual(["750.00", "high"]);
    expect((await add(userA, { name: "Floor", estimatedPrice: 0.0149 })).estimatedPrice).toBe("0.01");
  });

  it("rejects names that are only spaces and trims the rest", async () => {
    await expect(addWishlistItem(userA, { name: "   ", estimatedPrice: 10 })).rejects.toThrow();
    expect((await add(userA, { name: "  Lamp  ", estimatedPrice: 10 })).name).toBe("Lamp");
    await expect(addWishlistItem(userA, { name: "x".repeat(121), estimatedPrice: 10 })).rejects.toThrow();
    expect((await add(userA, { name: "x".repeat(120), estimatedPrice: 10 })).name).toHaveLength(120);
  });

  it("accepts any text as a link", async () => {
    const item = await add(userA, { name: "Lamp", url: "emag", estimatedPrice: 50 });
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
    const item = await add(userA, { name: "Monitor", estimatedPrice: 300 });
    const edit = { name: "Monitor 4K", estimatedPrice: 350 };
    authState.id = userB;
    expect(await updateWishlistItemAction({ id: item.id, ...edit })).toEqual(refused("This item no longer exists."));
    authState.id = "";
    expect(await updateWishlistItemAction({ id: item.id, ...edit })).toEqual(refused(SIGNED_OUT));
    expect((await getWishlist(userA)).find((i) => i.id === item.id)?.name).toBe("Monitor");
    authState.id = userA;
    succeeded(await updateWishlistItemAction({ id: item.id, ...edit }));
    expect((await getWishlist(userA)).find((i) => i.id === item.id)?.name).toBe("Monitor 4K");
    authState.id = "";
  });

  it("rejects a price that rounds to zero and a malformed id", async () => {
    authState.id = userA;
    expect(await addWishlistItemAction({ name: "Tiny", estimatedPrice: 0.004 })).toEqual(refused("Price must be at least 0.01"));
    expect(await deleteWishlistItemAction("nope")).toEqual(refused("Invalid id"));
  });

  it("restores a deleted item with its id and date, for the owner only", async () => {
    const item = await add(userA, { name: "Headphones", estimatedPrice: 600 });
    const input = { name: item.name, estimatedPrice: 600, id: item.id, createdAt: item.createdAt };

    // Anonymous is refused before anything is written.
    authState.id = "";
    expect(await restoreWishlistItemAction(input)).toEqual(refused(SIGNED_OUT));

    // While the row exists another user cannot take its id.
    authState.id = userB;
    expect(await restoreWishlistItemAction(input)).toEqual(refused("Item could not be restored."));
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

  it("answers a repeated add with the item already there, once, and never another user's [D-040]", async () => {
    authState.id = userA;
    const id = randomUUID();
    const input = { id, name: "Kettle", estimatedPrice: 150 };
    expect(succeeded(await addWishlistItemAction(input))).toMatchObject({ repeated: false, item: { id, name: "Kettle" } });
    expect(succeeded(await addWishlistItemAction({ ...input, name: "Changed meanwhile" }))).toMatchObject({ repeated: true, item: { id, name: "Kettle" } });
    expect((await getWishlist(userA)).filter((i) => i.id === id)).toHaveLength(1);
    // Another user sending that id writes nothing, changes nothing and learns nothing of the row.
    authState.id = userB;
    expect(await addWishlistItemAction({ ...input, name: "Hijacked" })).toEqual(refused("This item could not be saved."));
    expect((await getWishlist(userB)).find((i) => i.id === id)).toBeUndefined();
    expect((await getWishlist(userA)).find((i) => i.id === id)?.name).toBe("Kettle");
    authState.id = "";
    expect(await addWishlistItemAction(input)).toEqual(refused(SIGNED_OUT));
  });

  it("refuses a delete that matches no row, in people's words [WISH-07]", async () => {
    const item = await add(userA, { name: "Rug", estimatedPrice: 300 });
    authState.id = userB;
    expect(await deleteWishlistItemAction(item.id)).toEqual(refused("This item no longer exists."));
    authState.id = "";
    expect(await deleteWishlistItemAction(item.id)).toEqual(refused(SIGNED_OUT));
    authState.id = userA;
    succeeded(await deleteWishlistItemAction(item.id));
    expect(await deleteWishlistItemAction(item.id)).toEqual(refused("This item no longer exists."));
    expect(await deleteWishlistItemAction(randomUUID())).toEqual(refused("This item no longer exists."));
    authState.id = "";
  });

  it("tells too-long text in people's words and saves nothing [WISH-06]", async () => {
    authState.id = userA;
    const before = (await getWishlist(userA)).length;
    expect(await addWishlistItemAction({ name: "x".repeat(121), estimatedPrice: 10 })).toEqual(refused("Too long (max 120)"));
    expect(await addWishlistItemAction({ name: "Lamp", url: "x".repeat(501), estimatedPrice: 10 })).toEqual(refused("Too long (max 500)"));
    const item = await add(userA, { name: "Shelf", estimatedPrice: 10 });
    expect(await updateWishlistItemAction({ id: item.id, name: "x".repeat(121) })).toEqual(refused("Too long (max 120)"));
    expect((await getWishlist(userA)).length).toBe(before + 1);
    expect((await getWishlist(userA)).find((i) => i.id === item.id)?.name).toBe("Shelf");
    authState.id = "";
  });

  it("changes only the fields an edit sends, so another tab's change stays [D-040]", async () => {
    authState.id = userA;
    const item = await add(userA, { name: "Bike", url: "shop.ro", estimatedPrice: 900, category: "sport" });
    // Two tabs opened the same item: one renames it, the other changes its price.
    expect(succeeded(await updateWishlistItemAction({ id: item.id, name: "Road bike" })).item).toMatchObject({ name: "Road bike", estimatedPrice: "900.00", url: "shop.ro" });
    expect(succeeded(await updateWishlistItemAction({ id: item.id, estimatedPrice: 120.5 })).item).toMatchObject({ name: "Road bike", estimatedPrice: "120.50", priority: "low", category: "sport" });
    expect(succeeded(await updateWishlistItemAction({ id: item.id, url: null })).item).toMatchObject({ name: "Road bike", url: null });
    expect(succeeded(await updateWishlistItemAction({ id: item.id })).item).toMatchObject({ name: "Road bike", estimatedPrice: "120.50" });
    authState.id = userB;
    expect(await updateWishlistItemAction({ id: item.id })).toEqual(refused("This item no longer exists."));
    authState.id = "";
  });
});
