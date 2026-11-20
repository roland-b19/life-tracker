import { afterEach, describe, expect, it, vi } from "vitest";
import { SIGNED_OUT } from "@/lib/validations/result";

// No session at all: every server action must refuse before it touches input or data.
vi.mock("@/server/auth", () => {
  class UnauthorizedError extends Error {
    constructor() {
      super("Authentication required.");
      this.name = "UnauthorizedError";
    }
  }
  return {
    UnauthorizedError,
    requireUser: vi.fn(async () => {
      throw new UnauthorizedError();
    }),
  };
});

// Every module under src/actions, so a new action file cannot ship without this check.
const modules = import.meta.glob<Record<string, unknown>>("../src/actions/*.ts");

describe("server actions reject anonymous callers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("finds the action modules", () => {
    expect(Object.keys(modules).length).toBeGreaterThan(0);
  });

  // An action whose session check runs inside `respond` answers the signed-out refusal (D-010); one that checks before it
  // throws. Either way it never succeeds and never fails on the (missing) input first.
  it.each(Object.entries(modules))("every export of %s requires a session", async (file, load) => {
    // Feature flags on, so a disabled-flag error cannot hide a missing session check.
    vi.stubEnv("NEXT_PUBLIC_CLAUDE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_PUSH_ENABLED", "true");
    const actions = Object.entries(await load()).filter(([, v]) => typeof v === "function");
    expect(actions.length).toBeGreaterThan(0);
    for (const [name, action] of actions) {
      const outcome = await (action as (...a: unknown[]) => Promise<unknown>)().then(
        (answer) => ({ answer }),
        (e: unknown) => ({ thrown: e instanceof Error ? e.message : String(e) }),
      );
      expect([{ answer: { success: false, error: SIGNED_OUT } }, { thrown: "Authentication required." }], `${file}:${name}`).toContainEqual(outcome);
    }
  });
});
