import { z, ZodError } from "zod";

/** An expected failure (bad input, a rule of the page, a row that is not there): the user may read its message. */
export class Refusal extends Error {}

export type Failure = { success: false; error: string };

/** A server action's answer: what it returned, or the refusal's message. */
export type Answer<T extends object = object> = ({ success: true } & T) | Failure;

/** What a signed-out caller is told (D-040): a refusal the page can show, never a server error. */
export const SIGNED_OUT = "You're signed out. Sign in again.";

const numberLimit = (bound: "most" | "least", n: number | bigint, inclusive?: boolean) =>
  inclusive === false ? `Must be ${bound === "most" ? "less" : "more"} than ${n}` : `Must be at ${bound} ${n}`;

/**
 * Zod's issues in words for people. It runs only where a schema gives no message of its own (zod's `customError`),
 * so a schema's own text ("Name is required", "Invalid id") still wins; every other issue gets one of these instead of
 * zod's raw text ("Too small: expected string to have >=1 characters").
 */
z.config({
  customError: (issue) => {
    switch (issue.code) {
      case "invalid_type":
        if (issue.input === undefined || issue.input === null) return "Required";
        if (issue.expected === "number" || issue.expected === "int") return "Must be a number";
        if (issue.expected === "date") return "Invalid date";
        return "Invalid value";
      case "too_big":
        if (issue.origin === "string") return `Too long (max ${issue.maximum})`;
        if (issue.origin === "array" || issue.origin === "set") return `Too many (max ${issue.maximum})`;
        if (issue.origin === "number" || issue.origin === "int" || issue.origin === "bigint") return numberLimit("most", issue.maximum, issue.inclusive);
        return "Too large";
      case "too_small":
        if (issue.origin === "string") return Number(issue.minimum) <= 1 ? "Required" : `Too short (min ${issue.minimum})`;
        if (issue.origin === "array" || issue.origin === "set") return Number(issue.minimum) <= 1 ? "Required" : `Too few (min ${issue.minimum})`;
        if (issue.origin === "number" || issue.origin === "int" || issue.origin === "bigint") return numberLimit("least", issue.minimum, issue.inclusive);
        return "Too small";
      case "invalid_format":
        if (issue.format === "url") return "Must be a web link";
        if (issue.format === "date" || issue.format === "datetime") return "Invalid date";
        if (issue.format === "guid" || issue.format === "uuid") return "Invalid id";
        return "Invalid format";
      case "not_multiple_of":
        return `Must be a multiple of ${issue.divisor}`;
      case "invalid_value":
        return "Pick one of the options";
      case "unrecognized_keys":
        return `Unexpected field: ${issue.keys.join(", ")}`;
      default:
        return "Invalid value";
    }
  },
});

/** The session check's error, told apart by its name: the tests swap `@/server/auth` for a stand-in with its own class. */
const signedOut = (e: unknown) => e instanceof Error && e.name === "UnauthorizedError";

/**
 * The one answer of a server action: `{ success: true, ...what run returns }` or `{ success: false, error }`.
 * A failed zod `.parse()`, a `Refusal` and a signed-out caller (`requireUser()` called first thing inside `run`) become
 * the failure, so the browser gets the message (Next hides a thrown one in production). Anything else still throws.
 */
export async function respond<T extends object>(run: () => Promise<T>): Promise<Answer<T>> {
  try {
    return { success: true, ...(await run()) };
  } catch (e) {
    if (e instanceof ZodError) return { success: false, error: e.issues[0]?.message ?? "Invalid value" };
    if (e instanceof Refusal) return { success: false, error: e.message };
    if (signedOut(e)) return { success: false, error: SIGNED_OUT };
    throw e;
  }
}
