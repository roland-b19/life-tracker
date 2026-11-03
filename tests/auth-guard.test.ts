import { afterEach, describe, expect, it, vi } from "vitest";

describe("development authentication guard", () => {
  const env = process.env as Record<string, string | undefined>;

  afterEach(() => {
    vi.resetModules();
    delete env.AUTH_DEV;
    delete env.NODE_ENV;
  });

  it("refuses development authentication in production", async () => {
    env.AUTH_DEV = "true";
    env.NODE_ENV = "production";
    env.DATABASE_URL = "postgresql://unused";
    await expect(import("@/auth")).rejects.toThrow("AUTH_DEV must not be enabled in production.");
  });
});
