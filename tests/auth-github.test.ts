import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Account, User } from "next-auth";

const env = process.env as Record<string, string | undefined>;
const KEYS = ["AUTH_DEV", "AUTH_PROVIDER", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET", "OWNER_ALLOWLIST", "AUTH_ISSUER"];

async function load() {
  vi.resetModules();
  const { authOptions } = await import("@/auth");
  const { db } = await import("@/server/db");
  const { users } = await import("@/db/schema");
  return { authOptions, db, users };
}

const githubAccount = (id: string) => ({ provider: "github", providerAccountId: id, type: "oauth" }) as Account;

describe("GitHub sign-in with an owner allowlist", () => {
  const ownerId = String(Math.floor(Math.random() * 1e9) + 1e9);
  const otherId = String(Number(ownerId) + 1);

  beforeEach(() => {
    env.AUTH_PROVIDER = "github";
    env.AUTH_GITHUB_ID = "id";
    env.AUTH_GITHUB_SECRET = "secret";
    env.OWNER_ALLOWLIST = ownerId;
  });

  afterEach(() => {
    for (const key of KEYS) delete env[key];
  });

  it("lets the owner in and creates the user under the GitHub issuer", async () => {
    const { authOptions, db, users } = await load();
    const user = { id: "" } as User;
    expect(await authOptions.callbacks!.signIn!({ user, account: githubAccount(ownerId) } as never)).toBe(true);
    expect(user.id).toBeTruthy();
    const rows = await db.select().from(users).where(eq(users.subject, ownerId));
    expect(rows).toHaveLength(1);
    expect(rows[0].issuer).toBe("https://github.com");
  });

  it("denies another GitHub account before any users row is created", async () => {
    const { authOptions, db, users } = await load();
    const user = { id: "" } as User;
    expect(await authOptions.callbacks!.signIn!({ user, account: githubAccount(otherId) } as never)).toBe(false);
    expect(await db.select().from(users).where(eq(users.subject, otherId))).toHaveLength(0);
  });

  it("stops trusting a token once its GitHub id leaves the allowlist, with no database query", async () => {
    const { authOptions } = await load();
    const session = (userId?: string, githubId?: string) =>
      authOptions.callbacks!.session!({
        session: { user: { name: "x" }, expires: "" },
        token: { userId, githubId },
      } as never) as unknown as Promise<{ user: { id?: string } }>;

    expect((await session(randomUUID(), ownerId)).user.id).toBeTruthy();
    expect((await session(randomUUID(), otherId)).user.id).toBeUndefined();
    expect((await session(undefined, undefined)).user.id).toBeUndefined();
  });

  it("is a 180-day session, and Azure keeps 4 hours", async () => {
    expect((await load()).authOptions.session!.maxAge).toBe(180 * 24 * 60 * 60);
    env.AUTH_PROVIDER = "azure-ad";
    env.AUTH_ISSUER = "https://issuer.example.com";
    env.AUTH_AZURE_TENANT_ID = "t";
    env.AUTH_AZURE_CLIENT_ID = "c";
    env.AUTH_AZURE_CLIENT_SECRET = "s";
    expect((await load()).authOptions.session!.maxAge).toBe(4 * 60 * 60);
    for (const k of ["AUTH_AZURE_TENANT_ID", "AUTH_AZURE_CLIENT_ID", "AUTH_AZURE_CLIENT_SECRET"]) delete env[k];
  });

  it("refuses to start without an allowlist, without GitHub credentials, or with an unknown provider", async () => {
    delete env.OWNER_ALLOWLIST;
    await expect(load()).rejects.toThrow("OWNER_ALLOWLIST");
    env.OWNER_ALLOWLIST = ownerId;
    delete env.AUTH_GITHUB_SECRET;
    await expect(load()).rejects.toThrow("AUTH_GITHUB_ID and AUTH_GITHUB_SECRET");
    env.AUTH_PROVIDER = "google";
    await expect(load()).rejects.toThrow("AUTH_PROVIDER");
  });
});
