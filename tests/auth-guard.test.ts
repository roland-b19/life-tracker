import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

describe("development authentication guard", () => {
  const env = process.env as Record<string, string | undefined>;
  const databaseUrl = env.DATABASE_URL;

  afterEach(() => {
    vi.resetModules();
    env.DATABASE_URL = databaseUrl;
    delete env.AUTH_DEV;
    delete env.NODE_ENV;
    delete env.NEXTAUTH_SECRET;
    delete env.AUTH_AZURE_TENANT_ID;
    delete env.AUTH_AZURE_CLIENT_ID;
    delete env.AUTH_AZURE_CLIENT_SECRET;
    delete env.AUTH_ISSUER;
  });

  it("refuses development authentication in production", async () => {
    env.AUTH_DEV = "true";
    env.NODE_ENV = "production";
    env.DATABASE_URL = "postgresql://unused";
    await expect(import("@/auth")).rejects.toThrow("AUTH_DEV must not be enabled in production.");
  });

  it("refuses production authentication without OIDC configuration", async () => {
    env.AUTH_DEV = "false";
    env.NODE_ENV = "production";
    env.DATABASE_URL = "postgresql://unused";
    env.NEXTAUTH_SECRET = "test-secret";
    await expect(import("@/auth")).rejects.toThrow(
      "Production authentication requires AUTH_AZURE_TENANT_ID",
    );
  });

  it("refuses production authentication without the session signing secret", async () => {
    env.AUTH_DEV = "false";
    env.NODE_ENV = "production";
    env.DATABASE_URL = "postgresql://unused";
    env.AUTH_AZURE_TENANT_ID = "tenant";
    env.AUTH_AZURE_CLIENT_ID = "client";
    env.AUTH_AZURE_CLIENT_SECRET = "client-secret";
    env.AUTH_ISSUER = "https://issuer.example.com";
    await expect(import("@/auth")).rejects.toThrow(
      "Production authentication requires NEXTAUTH_SECRET.",
    );
  });
});

describe("requireUser", () => {
  it("rejects an anonymous request", async () => {
    vi.resetModules();
    vi.doMock("next-auth", () => ({ getServerSession: async () => null }));
    vi.doMock("@/auth", () => ({ authOptions: {} }));
    const { requireUser } = await import("@/server/auth");
    await expect(requireUser()).rejects.toThrow("Authentication required.");
    vi.doUnmock("next-auth");
    vi.doUnmock("@/auth");
  });
});

// D-041: one session row per signed-in device. The token names its row (`sid`); every page and action checks it.
describe("session rows (X-SESSION, MORE-01, PROD-02)", () => {
  const session = { value: null as null | { user: { id?: string; name?: string }; sid?: string } };
  const DAY = 24 * 60 * 60;
  const GITHUB_MAX_AGE = 180 * DAY;
  let sessions: typeof import("@/server/sessions");
  let auth: typeof import("@/server/auth");
  let db: typeof import("@/server/db").db;
  let userSessions: typeof import("@/db/schema").userSessions;
  let seedUser: typeof import("./auth").seedUser;
  let userId = "";

  const signedIn = (sid: string, id = userId) => (session.value = { user: { id, name: "Ana" }, sid });
  const rowsOf = (id: string) => db.select().from(userSessions).where(eq(userSessions.userId, id));
  const age = (sid: string, created: string, seen: string) =>
    db.execute(
      sql`update user_sessions set created_at = now() - ${created}::interval, last_seen_at = now() - ${seen}::interval where id = ${sid}`,
    );

  beforeAll(async () => {
    vi.resetModules();
    vi.doMock("next-auth", () => ({ getServerSession: async () => session.value }));
    vi.doMock("@/auth", () => ({ authOptions: {} }));
    vi.doMock("next/navigation", () => ({
      redirect: (to: string) => {
        throw new Error(`redirect:${to}`);
      },
    }));
    sessions = await import("@/server/sessions");
    auth = await import("@/server/auth");
    ({ db } = await import("@/server/db"));
    ({ userSessions } = await import("@/db/schema"));
    ({ seedUser } = await import("./auth"));
    userId = await seedUser();
  });

  afterAll(() => {
    vi.doUnmock("next-auth");
    vi.doUnmock("@/auth");
    vi.doUnmock("next/navigation");
  });

  it("signing out one device leaves another signed in, and the signed-out token is refused", async () => {
    const phone = await sessions.startSession(userId, GITHUB_MAX_AGE);
    const laptop = await sessions.startSession(userId, GITHUB_MAX_AGE);
    signedIn(phone);
    expect(await auth.requireUser()).toBe(userId);

    await sessions.endSession(phone, userId);
    // The phone's token is still validly signed, but its row is gone: refused for actions and pages alike.
    await expect(auth.requireUser()).rejects.toThrow("Authentication required.");
    await expect(auth.requirePageUser("/gym")).rejects.toThrow("redirect:/signin?next=%2Fgym");
    signedIn(laptop);
    expect(await auth.requireUser()).toBe(userId);
    await expect(auth.requirePageUser()).resolves.toEqual({ id: userId, name: "Ana" });
  });

  it("only the row's own user ends it, and a row answers only for its own user", async () => {
    const sid = await sessions.startSession(userId, GITHUB_MAX_AGE);
    const other = await seedUser();
    await sessions.endSession(sid, other);
    expect((await rowsOf(userId)).some((r) => r.id === sid)).toBe(true);
    signedIn(sid, other);
    await expect(auth.requireUser()).rejects.toThrow("Authentication required.");
  });

  it("a missing row, a token without a sid or a malformed sid signs out", async () => {
    signedIn(randomUUID());
    await expect(auth.requireUser()).rejects.toThrow("Authentication required.");
    session.value = { user: { id: userId, name: "Ana" } };
    await expect(auth.requirePageUser()).rejects.toThrow("redirect:/signin");
    signedIn("not-a-uuid");
    await expect(auth.requireUser()).rejects.toThrow("Authentication required.");
    await expect(auth.optionalPageUser()).resolves.toBeNull();
  });

  it("a deleted user's token signs out: the row goes with the user", async () => {
    const gone = await seedUser();
    const sid = await sessions.startSession(gone, GITHUB_MAX_AGE);
    signedIn(sid, gone);
    expect(await auth.requireUser()).toBe(gone);
    const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
    await admin.query("DELETE FROM users WHERE id = $1", [gone]);
    await admin.end();
    await expect(auth.requirePageUser("/todos")).rejects.toThrow("redirect:/signin?next=%2Ftodos");
  });

  it("the check moves last_seen_at once it is more than a day old, and leaves a fresher one alone", async () => {
    const stale = await sessions.startSession(userId, GITHUB_MAX_AGE);
    const fresh = await sessions.startSession(userId, GITHUB_MAX_AGE);
    await age(stale, "200 days", "2 days");
    await age(fresh, "200 days", "2 hours");
    expect(await sessions.isSessionLive(stale, userId)).toBe(true);
    expect(await sessions.isSessionLive(fresh, userId)).toBe(true);
    const rows = await rowsOf(userId);
    const seenAgo = (sid: string) => Date.now() - rows.find((r) => r.id === sid)!.lastSeenAt.getTime();
    expect(seenAgo(stale)).toBeLessThan(60_000);
    expect(seenAgo(fresh)).toBeGreaterThan(60 * 60_000);
  });

  it("sign-in prunes a row unseen past the max age, and keeps one created long ago but seen yesterday", async () => {
    const used = await sessions.startSession(userId, GITHUB_MAX_AGE);
    const abandoned = await sessions.startSession(userId, GITHUB_MAX_AGE);
    await age(used, "400 days", "1 day");
    // Past the max age plus the day the check may lag behind (src/server/sessions.ts): no live token can name it.
    await age(abandoned, "400 days", "182 days");
    const next = await sessions.startSession(userId, GITHUB_MAX_AGE);
    const ids = (await rowsOf(userId)).map((r) => r.id);
    expect(ids).toContain(used);
    expect(ids).toContain(next);
    expect(ids).not.toContain(abandoned);
  });

  it("with Azure's 4-hour tokens, a row seen 5 hours ago is kept: its token may have been renewed since", async () => {
    const used = await sessions.startSession(userId, 4 * 60 * 60);
    await age(used, "5 hours", "5 hours");
    await sessions.startSession(userId, 4 * 60 * 60);
    expect((await rowsOf(userId)).map((r) => r.id)).toContain(used);
  });
});
