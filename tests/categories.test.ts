import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  id: "",
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/server/auth", () => ({
  UnauthorizedError: authState.UnauthorizedError,
  requireUser: vi.fn(async () => {
    if (!authState.id) throw new authState.UnauthorizedError();
    return authState.id;
  }),
}));
import { db } from "@/server/db";
import { users } from "@/db/schema";
import { getCategories } from "@/lib/categories";
import { addWishlistItem, getWishlist } from "@/lib/wishlist";
import { createTodo, getDailyTodos } from "@/lib/todos";
import { addCategoryAction, deleteCategoryAction, renameCategoryAction } from "@/app/actions/categories";
import { toISODate } from "@/lib/format-date";

async function seedUser(subject: string) {
  const [user] = await db.insert(users).values({ issuer: "test", subject }).returning({ id: users.id });
  return user.id;
}

describe("Categories: lists, items and multi-user isolation", () => {
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    userA = await seedUser(`categories-userA-${randomUUID()}`);
    userB = await seedUser(`categories-userB-${randomUUID()}`);
  });

  it("adds, renames and deletes a category, moving the items with it", async () => {
    authState.id = userA;
    expect((await addCategoryAction({ scope: "wishlist", name: "  Gifts " })).success).toBe(true);
    expect((await addCategoryAction({ scope: "wishlist", name: "gifts" })).success).toBe(false);
    const item = await addWishlistItem(userA, { name: "Scarf", estimatedPrice: 20, category: "gifts" });
    expect(item.category).toBe("gifts");

    await renameCategoryAction({ scope: "wishlist", from: "gifts", to: "presents" });
    expect((await getWishlist(userA))[0].category).toBe("presents");
    expect((await getCategories(userA, ["wishlist"])).wishlist).toEqual(["presents"]);

    await deleteCategoryAction({ scope: "wishlist", name: "presents" });
    expect((await getWishlist(userA))[0].category).toBe("other");
    expect((await getCategories(userA, ["wishlist"])).wishlist).toEqual([]);
  });

  it("merges when a rename lands on an existing category, and refuses 'other'", async () => {
    authState.id = userA;
    await addCategoryAction({ scope: "personal", name: "home" });
    await addCategoryAction({ scope: "personal", name: "house" });
    await createTodo(userA, {
      space: "personal",
      title: "Fix tap",
      isRecurring: true,
      recurrencePattern: "daily",
      dueDate: toISODate(),
      category: "home",
    });
    await renameCategoryAction({ scope: "personal", from: "home", to: "house" });
    expect((await getCategories(userA, ["personal"])).personal).toEqual(["house"]);
    const { todos } = await getDailyTodos(userA, "personal", toISODate());
    expect(todos.find((t) => t.title === "Fix tap")?.category).toBe("house");

    await expect(renameCategoryAction({ scope: "personal", from: "house", to: "other" })).rejects.toThrow();
    await expect(addCategoryAction({ scope: "personal", name: "other" })).rejects.toThrow();
  });

  it("adds a category when an item is saved with a new one", async () => {
    await addWishlistItem(userA, { name: "Lamp", estimatedPrice: 30, category: "decor" });
    expect((await getCategories(userA, ["wishlist"])).wishlist).toContain("decor");
  });

  it("denies another user: they neither see nor change the owner's categories", async () => {
    authState.id = userA;
    await addCategoryAction({ scope: "business", name: "clients" });

    authState.id = userB;
    expect((await getCategories(userB, ["business", "wishlist"])).business).toEqual([]);
    expect((await renameCategoryAction({ scope: "business", from: "clients", to: "x" })).success).toBe(false);
    expect((await deleteCategoryAction({ scope: "business", name: "clients" })).success).toBe(false);
    expect((await getCategories(userA, ["business"])).business).toEqual(["clients"]);
  });
});
