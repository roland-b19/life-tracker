import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { users } from "@/db/schema";

/**
 * The signed-in user of a test: set `authState.id` to act as that user, `""` to act as nobody.
 * A test file that needs it mocks the auth module with
 * `vi.mock("@/server/auth", async () => (await import("./auth")).authModule);`
 * (the factory runs when the mock is first needed, so the hoisting of `vi.mock` is no problem) and imports `authState` from here.
 */
export const authState = {
  id: "",
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super("Authentication required.");
      this.name = "UnauthorizedError";
    }
  },
};

/** The stand-in for `@/server/auth`: `requireUser` answers `authState.id`, or throws as the real one does without a session. */
export const authModule = {
  UnauthorizedError: authState.UnauthorizedError,
  requireUser: async () => {
    if (!authState.id) throw new authState.UnauthorizedError();
    return authState.id;
  },
};

/** Inserts a user and returns its id. The subject is random unless the test names it. */
export async function seedUser(subject = `user-${randomUUID()}`) {
  const [user] = await db.insert(users).values({ issuer: "test", subject }).returning({ id: users.id });
  return user.id;
}
