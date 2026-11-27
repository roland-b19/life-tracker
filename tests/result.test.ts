import ts from "typescript";
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
    expect(await messageFor(categoryNameSchema, { scope: "wishlist", name: "other" })).toBe('"other" is built in');
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

describe("a refusal or check several actions give is written once [U6]", () => {
  const sources = import.meta.glob(["../src/**/*.{ts,tsx}", "../app/**/*.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<
    string,
    string
  >;
  const writtenIn = (words: string) =>
    Object.entries(sources)
      .filter(([, text]) => text.includes(words))
      .map(([file]) => file);

  it.each([
    ["Category not found.", "../src/lib/validations/categories.ts"],
    ["has changed since.", "../src/lib/validations/result.ts"],
    ["already exists.", "../src/lib/validations/result.ts"],
    ["Only today and yesterday can be changed.", "../src/lib/validations/food.ts"],
    ["Date cannot be in the future", "../src/lib/validations/common.ts"],
    ["Maximum two decimal places", "../src/lib/validations/common.ts"],
    ["Nothing to save", "../src/lib/validations/common.ts"],
    ["< 1e-6", "../src/lib/validations/common.ts"],
  ])("%s", (words, home) => {
    expect(writtenIn(words)).toEqual([home]);
  });

  // Both halves of a hand rounding to decimals: `Math.round(x * 10…)` (scaling up) and `Math.round(…) / 10…` (back down).
  it("rounds to decimals only in roundTo (src/lib/number-format.ts) [U4]", () => {
    const rounding = /Math\.round\([\w.]+\s*\*\s*(10+|factor)\b|Math\.round\([^;]*\)\s*\/\s*(10+|factor)\b/;
    expect(Object.entries(sources).filter(([, text]) => rounding.test(text)).map(([file]) => file)).toEqual(["../src/lib/number-format.ts"]);
  });
});

// Every test file, as text, for the checks on how the tests are written.
const tests = import.meta.glob("./**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// Action result (D-010): a test narrows an action's answer with `succeeded()` (tests/succeeded.ts), never by hand.
const byHand = /if\s*\(\s*!\s*\w+\.success\b|\b(\w+)\.success\s*(\?|&&)[^;]*\b\1\./;
it("narrows an action's answer in the tests only through succeeded() [D-010]", () => {
  expect(Object.keys(tests).length).toBeGreaterThan(30);
  expect(Object.entries(tests).filter(([, text]) => byHand.test(text)).map(([file]) => file)).toEqual(["./succeeded.ts"]);
});

// The probes are split at the dot, so this file's own text never matches the check above.
it.each([
  ["if(!x" + ".success)", true],
  ["r.success&&r" + ".item", true],
  ["r.success ? r" + ".item", true],
  ["if (saved" + ".success) {", false],
  ["logged.success ? 1 : 0", false],
])("the D-010 check finds a hand narrowing in %j: %s", (line, found) => {
  expect(byHand.test(line)).toBe(found);
});

// One reset for the unit tests' database (D-047): only tests/db.ts empties tables. The bracket keeps this line out.
it("empties the test database only in resetDb (tests/db.ts) [D-047]", () => {
  expect(Object.entries(tests).filter(([, text]) => /\bTRUNCAT[E]\b/.test(text)).map(([file]) => file)).toEqual(["./db.ts"]);
});

// One way to open a second device of the signed-in user in the browser specs: newDevice (tests/e2e/helpers.ts), a fresh
// context with the page's cookies only. The bracket keeps this line out.
it("opens another browser context in the e2e specs only through newDevice (tests/e2e/helpers.ts)", () => {
  const specs = Object.entries(tests).filter(([file]) => file.startsWith("./e2e/"));
  expect(specs.length).toBeGreaterThan(5);
  expect(specs.filter(([, text]) => /\bbrowser\.newContex[t]\(/.test(text)).map(([file]) => file)).toEqual(["./e2e/helpers.ts"]);
});

// One way for a browser spec to send a request itself: onNewConnection (tests/e2e/helpers.ts), a request context of its
// own, so no request reuses a connection the dev server may have closed. The specs are read with the type checker, so a
// call is found by what it calls, whatever name it goes through (Playwright's `request` fixture, `page.request` or an alias
// of it, a renamed import, a route handler's parameter), and a comment or a string never counts: a request context's
// get/post/put/patch/delete/head/fetch only on the context onNewConnection hands its `send`, a route's fetch() never, and
// a new request context (`newContext` of Playwright's `request`) only in helpers.ts.
it("sends a spec's own requests in the e2e specs only through onNewConnection (tests/e2e/helpers.ts)", () => {
  const files = ts.sys.readDirectory("tests/e2e", [".ts"]);
  expect(files.length).toBeGreaterThan(5);
  const { options } = ts.parseJsonConfigFileContent(ts.readConfigFile("tsconfig.json", ts.sys.readFile).config, ts.sys, ".");
  const program = ts.createProgram(files, options);
  const checker = program.getTypeChecker();
  // Whether `receiver` is the context onNewConnection hands its `send`: the first parameter of its second argument.
  const isSendContext = (receiver: ts.Expression) => {
    const declaration = ts.isIdentifier(receiver) ? checker.getSymbolAtLocation(receiver)?.valueDeclaration : undefined;
    const send = declaration && ts.isParameter(declaration) ? declaration.parent : undefined;
    const call = send?.parent;
    return !!call && ts.isCallExpression(call) && call.expression.getText() === "onNewConnection" && call.arguments[1] === send && send.parameters[0] === declaration;
  };
  const sent: string[] = [];
  for (const name of files) {
    const file = program.getSourceFile(name)!;
    const visit = (n: ts.Node) => {
      const called = ts.isCallExpression(n) ? checker.getResolvedSignature(n)?.declaration : undefined;
      if (called && ts.isMethodSignature(called) && ts.isInterfaceDeclaration(called.parent)) {
        const method = `${called.parent.name.text}.${called.name.getText()}`;
        const callee = (n as ts.CallExpression).expression;
        const onSendContext = ts.isPropertyAccessExpression(callee) && isSendContext(callee.expression);
        if (
          (/^APIRequestContext\.(get|post|put|patch|delete|head|fetch)$/.test(method) && !onSendContext) ||
          method === "Route.fetch" ||
          (method === "APIRequest.newContext" && name !== "tests/e2e/helpers.ts")
        )
          sent.push(`${name}:${file.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${method}`);
      }
      ts.forEachChild(n, visit);
    };
    visit(file);
  }
  expect(sent).toEqual([]);
});
