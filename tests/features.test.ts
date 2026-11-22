import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", async () => (await import("./auth")).authModule);
import { authState } from "./auth";

import { isClaudeEnabled, isPushEnabled } from "@/lib/features";
import { connectClaudeAction, disconnectClaudeAction } from "@/actions/claude-connection";
import { sendFoodChatMessageAction } from "@/actions/food-chat";
import { savePushSubscriptionAction } from "@/actions/todos";

// A signed-in caller, so a refusal here comes from the flag, not from the session check.
beforeEach(() => (authState.id = "00000000-0000-0000-0000-000000000001"));
afterEach(() => {
  vi.unstubAllEnvs();
  authState.id = "";
});

describe("feature flags", () => {
  it("are off unless set to true", () => {
    expect(isClaudeEnabled()).toBe(false);
    expect(isPushEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_CLAUDE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_PUSH_ENABLED", "true");
    expect(isClaudeEnabled()).toBe(true);
    expect(isPushEnabled()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_CLAUDE_ENABLED", "1");
    expect(isClaudeEnabled()).toBe(false);
  });

  it("make the Claude and push actions reject when off", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLAUDE_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_PUSH_ENABLED", "");
    await expect(connectClaudeAction({ token: "sk-ant-oat01-test-token-abcdefghijklmnop" })).rejects.toThrow(/disabled/);
    await expect(disconnectClaudeAction()).rejects.toThrow(/disabled/);
    await expect(
      sendFoodChatMessageAction({ message: "hi", history: [], date: "2026-01-01", time: "12:00" }),
    ).rejects.toThrow(/disabled/);
    await expect(savePushSubscriptionAction({})).rejects.toThrow(/disabled/);
  });
});
