import { ZodError } from "zod";

/** An expected failure (bad input, a rule of the page, a row that is not there): the user may read its message. */
export class Refusal extends Error {}

export type Failure = { success: false; error: string };

/**
 * The one answer of a server action: `{ success: true, ...what run returns }` or `{ success: false, error }`.
 * A failed zod `.parse()` and a `Refusal` become the failure, so the browser gets the message (Next hides a thrown
 * one in production). Anything else, the session check included, still throws. Call it after `requireUser()`, never around it.
 */
export async function respond<T extends object>(run: () => Promise<T>): Promise<({ success: true } & T) | Failure> {
  try {
    return { success: true, ...(await run()) };
  } catch (e) {
    if (e instanceof ZodError) return { success: false, error: e.issues[0]?.message ?? "Invalid input." };
    if (e instanceof Refusal) return { success: false, error: e.message };
    throw e;
  }
}
