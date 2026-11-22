import { describe, expect, it } from "vitest";
import { linkOf } from "@/lib/link";
import { addWishlistItemSchema } from "@/lib/validations/wishlist";
import { addTodoSchema } from "@/lib/validations/todos";

describe("linkOf", () => {
  it("opens URLs and bare domains, shows the host", () => {
    expect(linkOf("https://shop.ro/a/b")).toEqual({ href: "https://shop.ro/a/b", label: "shop.ro ↗" });
    expect(linkOf("emag.ro")).toEqual({ href: "https://emag.ro", label: "emag.ro ↗" });
  });
  it("opens a bare domain with a query and no slash [WISH-04]", () => {
    expect(linkOf("emag.ro?id=5")).toEqual({ href: "https://emag.ro?id=5", label: "emag.ro ↗" });
    expect(linkOf("shop.example.com/p?x=1")).toEqual({ href: "https://shop.example.com/p?x=1", label: "shop.example.com ↗" });
  });
  it("needs a last label of two letters or more for a bare domain [WISH-03]", () => {
    for (const v of ["v1.2", "3.5", "model.x1", "a.b", "box.9/x"]) expect(linkOf(v)).toEqual({ href: null, label: v });
  });
  it("keeps a store name, a file-like word and a link with credentials as plain text", () => {
    for (const v of ["Emag", "Node.js", "notes.md", "https://user:secret@shop.ro/x", "https://user@shop.ro"])
      expect(linkOf(v)).toEqual({ href: null, label: v });
  });
});

describe("a name needs a visible character", () => {
  it("refuses zero-width-only wishlist names and task titles", () => {
    expect(addWishlistItemSchema.safeParse({ name: "​​", estimatedPrice: 5 }).success).toBe(false);
    expect(addWishlistItemSchema.safeParse({ name: "Lamp", estimatedPrice: 5 }).success).toBe(true);
    expect(addTodoSchema.safeParse({ title: "﻿", dueDate: "2026-11-15" }).success).toBe(false);
  });
});
