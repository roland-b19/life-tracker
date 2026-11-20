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

  it("stops trusting a token once its GitHub id leaves the allowlist, and passes the sid on, with no database query", async () => {
    const { authOptions, db } = await load();
    const queries = (["select", "insert", "update", "delete", "execute"] as const).map((m) => vi.spyOn(db, m));
    const session = (userId?: string, githubId?: string, sid?: string) =>
      authOptions.callbacks!.session!({
        session: { user: { name: "x" }, expires: "" },
        token: { userId, githubId, sid },
      } as never) as unknown as Promise<{ user: { id?: string }; sid?: string }>;

    const sid = randomUUID();
    const owner = await session(randomUUID(), ownerId, sid);
    expect(owner.user.id).toBeTruthy();
    expect(owner.sid).toBe(sid);
    expect((await session(randomUUID(), otherId)).user.id).toBeUndefined();
    expect((await session(undefined, undefined)).user.id).toBeUndefined();
    for (const query of queries) expect(query).not.toHaveBeenCalled();
  });

  it("starts a session row at sign-in only, and signing out ends only that row (X-SESSION)", async () => {
    const { authOptions, db } = await load();
    const { userSessions } = await import("@/db/schema");
    const user = { id: "" } as User;
    await authOptions.callbacks!.signIn!({ user, account: githubAccount(ownerId) } as never);
    const jwt = (token: Record<string, unknown>, signingIn: boolean) =>
      authOptions.callbacks!.jwt!({
        token,
        user: signingIn ? user : undefined,
        account: signingIn ? githubAccount(ownerId) : null,
      } as never) as Promise<{ userId?: string; sid?: string; githubId?: string }>;
    const rows = async () =>
      (await db.select().from(userSessions).where(eq(userSessions.userId, user.id))).map((r) => r.id);
    const before = await rows();

    const phone = await jwt({}, true);
    const laptop = await jwt({}, true);
    expect(phone).toMatchObject({ userId: user.id, githubId: ownerId });
    expect(phone.sid).toBeTruthy();
    expect(laptop.sid).not.toBe(phone.sid);
    expect(await rows()).toEqual(expect.arrayContaining([phone.sid, laptop.sid]));
    // A token refresh keeps its sid and adds no row.
    expect((await jwt({ ...phone }, false)).sid).toBe(phone.sid);
    expect(await rows()).toHaveLength(before.length + 2);

    await authOptions.events!.signOut!({ token: phone, session: undefined } as never);
    const after = await rows();
    expect(after).not.toContain(phone.sid);
    expect(after).toContain(laptop.sid);
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

describe("dev sign-in (MORE-12)", () => {
  afterEach(() => {
    for (const key of KEYS) delete env[key];
  });

  it("accepts only lower-case letters, digits and dashes, and the e2e fixture's names still pass", async () => {
    env.AUTH_DEV = "true";
    env.AUTH_PROVIDER = "github";
    env.AUTH_GITHUB_ID = "id";
    env.AUTH_GITHUB_SECRET = "secret";
    env.OWNER_ALLOWLIST = "1";
    const { authOptions, db, users } = await load();
    const dev = authOptions.providers.find((p) => p.id === "credentials") as unknown as {
      options: { authorize: (credentials: { name?: unknown }) => Promise<{ id: string; name: string } | null> };
    };
    const authorize = (name: unknown) => dev.options.authorize({ name });

    for (const bad of ["Roland", "a b", "<b>x</b>", "x_y", "ă", "", "a".repeat(65), 42]) {
      expect(await authorize(bad)).toBeNull();
    }
    const name = `e2e-${randomUUID().slice(0, 8)}`;
    const user = await authorize(name);
    expect(user?.name).toBe(name);
    const rows = await db.select().from(users).where(eq(users.subject, name));
    expect(rows.map((r) => r.issuer)).toEqual(["dev"]);
  });
});
