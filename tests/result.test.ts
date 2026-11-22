import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Refusal, respond, SIGNED_OUT } from "@/lib/validations/result";
import { isoDate, newId } from "@/lib/validations/common";
import { categoryNameSchema, revertCategorySchema } from "@/lib/validations/categories";

/** The message `respond` answers for a schema that refuses `input`. */
const messageFor = async (schema: z.ZodType, input: unknown) => {
  const answer = await respond(async () => (schema.parse(input), {}));
  if (answer.success) throw new Error("the schema accepted the input");
  return answer.error;
};

describe("respond", () => {
  it("answers success with the data", async () => {
    expect(await respond(async () => ({ name: "x" }))).toEqual({ success: true, name: "x" });
  });

  it("answers a Refusal's message", async () => {
    expect(await respond(async () => { throw new Refusal("Category not found."); })).toEqual({ success: false, error: "Category not found." });
  });

  it("answers the signed-out refusal for an UnauthorizedError, whatever class made it", async () => {
    class UnauthorizedError extends Error {
      name = "UnauthorizedError";
    }
    expect(await respond(async () => { throw new UnauthorizedError("Authentication required."); })).toEqual({ success: false, error: SIGNED_OUT });
    expect(SIGNED_OUT).toBe("You're signed out. Sign in again.");
  });

  it("throws anything else on", async () => {
    await expect(respond(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });
});

describe("zod issues become people's messages", () => {
  it.each([
    ["a text over its limit", z.object({ name: z.string().max(50) }), { name: "x".repeat(51) }, "Too long (max 50)"],
    ["a missing field", z.object({ name: z.string() }), {}, "Required"],
    ["an empty text", z.string().min(1), "", "Required"],
    ["a text under its minimum", z.string().min(3), "ab", "Too short (min 3)"],
    ["a word where a number goes", z.number(), "ten", "Must be a number"],
    ["a fraction where a whole number goes", z.number().int(), 1.5, "Must be a number"],
    ["a number over its limit", z.number().max(10), 11, "Must be at most 10"],
    ["a number under an exclusive limit", z.number().positive(), 0, "Must be more than 0"],
    ["a number under its limit", z.number().min(1), 0, "Must be at least 1"],
    ["too many entries", z.array(z.string()).max(2), ["a", "b", "c"], "Too many (max 2)"],
    ["a value outside the options", z.enum(["a", "b"]), "c", "Pick one of the options"],
    ["a malformed id", z.guid(), "nope", "Invalid id"],
    ["a malformed link", z.url(), "nope", "Must be a web link"],
    ["a malformed time", z.iso.datetime(), "nope", "Invalid date"],
    ["an unexpected field", z.strictObject({}), { extra: 1 }, "Unexpected field: extra"],
    ["a wrong type", z.boolean(), "yes", "Invalid value"],
  ])("%s", async (_, schema, input, message) => {
    expect(await messageFor(schema, input)).toBe(message);
  });

  it("keeps a schema's own message", async () => {
    expect(await messageFor(isoDate, "2026-02-30")).toBe("Invalid date format (YYYY-MM-DD)");
    expect(await messageFor(categoryNameSchema, { scope: "wishlist", name: "other" })).toBe('"other" is built in.');
  });

  it("answers an empty, spaces-only or invisible category name with the schema's own message", async () => {
    for (const name of ["", "   ", "​"]) expect(await messageFor(categoryNameSchema, { scope: "wishlist", name })).toBe("Name is required");
  });

  it("never lets zod's own text through for the app's schemas", async () => {
    expect(await messageFor(categoryNameSchema, { scope: "wishlist", name: "x".repeat(51) })).toBe("Too long (max 50)");
    expect(await messageFor(categoryNameSchema, { scope: "shelf", name: "x" })).toBe("Pick one of the options");
    expect(await messageFor(revertCategorySchema, { scope: "wishlist", name: "x", current: "y", sortOrder: "1", itemIds: [], dropCurrent: true })).toBe(
      "Must be a number",
    );
  });
});

describe("newId: an add's id made on the device", () => {
  it("is optional and takes any uuid", () => {
    expect(newId.parse(undefined)).toBeUndefined();
    const id = crypto.randomUUID();
    expect(newId.parse(id)).toBe(id);
  });

  it("refuses a malformed id", async () => {
    expect(await messageFor(z.object({ id: newId }), { id: "not-an-id" })).toBe("Invalid id");
  });
});

describe("a refusal several actions give is written once [U6]", () => {
  const sources = import.meta.glob(["../src/**/*.{ts,tsx}", "../app/**/*.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<
    string,
    string
  >;
  // Gym still words its own duplicate name; it moves to alreadyExists with the gym pages.
  const files = Object.entries(sources).filter(([file]) => !/gym/.test(file));
  const writtenIn = (words: string) => files.filter(([, text]) => text.includes(words)).map(([file]) => file);

  it.each([
    ["Category not found.", "../src/lib/validations/categories.ts"],
    ["has changed since.", "../src/lib/validations/result.ts"],
    ["already exists.", "../src/lib/validations/result.ts"],
    ["Only today and yesterday can be changed.", "../src/lib/validations/food.ts"],
  ])("%s", (words, home) => {
    expect(writtenIn(words)).toEqual([home]);
  });
});
