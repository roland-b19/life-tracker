import { afterEach, describe, expect, it, vi } from "vitest";
import { SIGNED_OUT } from "@/lib/validations/result";
import { refused } from "./succeeded";
import { authState } from "./auth";

// No session at all: every server action must refuse before it touches input or data.
vi.mock("@/server/auth", async () => (await import("./auth")).authModule);

// Every module under src/actions, so a new action file cannot ship without this check.
const modules = import.meta.glob<Record<string, unknown>>("../src/actions/*.ts");

describe("server actions reject anonymous callers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("finds the action modules", () => {
    expect(Object.keys(modules).length).toBeGreaterThan(0);
  });

  // Every action checks the session first thing inside `respond`, so a signed-out caller gets the signed-out refusal
  // (D-010): never a throw, a success, or a failure on the (missing) input first.
  it.each(Object.entries(modules))("every export of %s requires a session", async (file, load) => {
    authState.id = ""; // nobody is signed in
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
      expect(outcome, `${file}:${name}`).toEqual({ answer: refused(SIGNED_OUT) });
    }
  });
});
