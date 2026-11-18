import { afterEach, describe, expect, it, vi } from "vitest";

// No session at all: every server action must refuse before it touches input or data.
vi.mock("@/server/auth", () => {
  class UnauthorizedError extends Error {
    constructor() {
      super("Authentication required.");
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

  it.each(Object.entries(modules))("every export of %s requires a session", async (file, load) => {
    // Feature flags on, so a disabled-flag error cannot hide a missing session check.
    vi.stubEnv("NEXT_PUBLIC_CLAUDE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_PUSH_ENABLED", "true");
    const actions = Object.entries(await load()).filter(([, v]) => typeof v === "function");
    expect(actions.length).toBeGreaterThan(0);
    for (const [name, action] of actions) {
      await expect((action as (...a: unknown[]) => Promise<unknown>)(), `${file}:${name}`).rejects.toThrow(
        "Authentication required.",
      );
    }
  });
});
