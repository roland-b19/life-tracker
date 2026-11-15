import { describe, expect, it } from "vitest";
import { linkOf } from "@/lib/link";
import { createWishlistItemSchema } from "@/lib/validations/wishlist";
import { createTodoSchema } from "@/lib/validations/todos";

describe("linkOf", () => {
  it("opens URLs and bare domains, shows the host", () => {
    expect(linkOf("https://shop.ro/a/b")).toEqual({ href: "https://shop.ro/a/b", label: "shop.ro ↗" });
    expect(linkOf("emag.ro")).toEqual({ href: "https://emag.ro", label: "emag.ro ↗" });
  });
  it("keeps a store name, a file-like word and a link with credentials as plain text", () => {
    for (const v of ["Emag", "Node.js", "notes.md", "https://user:secret@shop.ro/x", "https://user@shop.ro"])
      expect(linkOf(v)).toEqual({ href: null, label: v });
  });
});

describe("a name needs a visible character", () => {
  it("refuses zero-width-only wishlist names and task titles", () => {
    expect(createWishlistItemSchema.safeParse({ name: "​​", estimatedPrice: 5 }).success).toBe(false);
    expect(createWishlistItemSchema.safeParse({ name: "Lamp", estimatedPrice: 5 }).success).toBe(true);
    expect(createTodoSchema.safeParse({ title: "﻿", dueDate: "2026-11-15" }).success).toBe(false);
  });
});
