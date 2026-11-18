import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  id: "",
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super("Authentication required.");
      this.name = "UnauthorizedError";
    }
  },
}));

vi.mock("@/server/auth", () => ({
  UnauthorizedError: authState.UnauthorizedError,
  requireUser: vi.fn(async () => {
    if (!authState.id) throw new authState.UnauthorizedError();
    return authState.id;
  }),
}));

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { claudeConnections, users } from "@/db/schema";
import { connectClaudeAction, disconnectClaudeAction, restoreClaudeConnectionAction } from "@/app/actions/claude-connection";
import { decryptToken, encryptToken, getClaudeConnection, getClaudeToken } from "@/lib/claude-connection";
import { succeeded } from "./succeeded";

const TOKEN = "sk-ant-oat01-test-token-abcdefghijklmnopqrstuvwxyz";

async function seedUser() {
  const [user] = await db.insert(users).values({ issuer: "test", subject: `claude-${randomUUID()}` }).returning({ id: users.id });
  return user.id;
}

describe("Claude connection", () => {
  beforeAll(() => {
    process.env.CLAUDE_TOKEN_KEY = randomBytes(32).toString("base64");
    vi.stubEnv("NEXT_PUBLIC_CLAUDE_ENABLED", "true");
  });

  afterEach(() => {
    authState.id = "";
  });

  it("encrypts with a fresh IV and rejects a tampered value", () => {
    const a = encryptToken(TOKEN);
    expect(a).not.toContain(TOKEN);
    expect(encryptToken(TOKEN)).not.toBe(a);
    expect(decryptToken(a)).toBe(TOKEN);

    const [v, iv, tag, data] = a.split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decryptToken([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });

  it("stores only ciphertext and returns the token only to its owner", async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    authState.id = owner;

    const res = succeeded(await connectClaudeAction({ token: `  ${TOKEN}  ` }));

    expect(res.connectedAt).toBeTruthy();
    const [row] = await db.select().from(claudeConnections).where(eq(claudeConnections.userId, owner));
    expect(row.tokenEncrypted).not.toContain(TOKEN);
    expect(await getClaudeToken(owner)).toBe(TOKEN);
    expect(await getClaudeToken(stranger)).toBeNull();
    expect(await getClaudeConnection(stranger)).toBeNull();
  });

  it("rejects anything that is not a setup-token", async () => {
    authState.id = await seedUser();
    for (const token of ["", "hello", "sk-ant-short", `sk-ant-${"a".repeat(30)}; rm -rf /`]) {
      expect(await connectClaudeAction({ token })).toHaveProperty("error");
    }
    expect(await getClaudeConnection(authState.id)).toBeNull();
  });

  it("disconnect removes only the caller's connection", async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    authState.id = stranger;
    await connectClaudeAction({ token: TOKEN });
    authState.id = owner;
    await connectClaudeAction({ token: TOKEN });

    await disconnectClaudeAction();

    expect(await getClaudeConnection(owner)).toBeNull();
    expect(await getClaudeConnection(stranger)).not.toBeNull();
  });

  it("undoes a replace and a disconnect, and refuses a value that does not decrypt", async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    const OLD = `${TOKEN}-old`;
    authState.id = owner;
    await connectClaudeAction({ token: OLD });
    const replaced = succeeded(await connectClaudeAction({ token: TOKEN }));
    expect(await getClaudeToken(owner)).toBe(TOKEN);
    await restoreClaudeConnectionAction(replaced.previous!);
    expect(await getClaudeToken(owner)).toBe(OLD);

    const gone = succeeded(await disconnectClaudeAction());
    expect(await getClaudeConnection(owner)).toBeNull();
    await restoreClaudeConnectionAction(gone.previous!);
    expect(await getClaudeToken(owner)).toBe(OLD);

    await expect(
      restoreClaudeConnectionAction({ tokenEncrypted: "v1:AAAA:AAAA:AAAA", connectedAt: new Date().toISOString() }),
    ).rejects.toThrow();

    // The stranger restoring the owner's ciphertext only writes their own row; the owner's stays as it was.
    authState.id = stranger;
    await restoreClaudeConnectionAction(gone.previous!);
    authState.id = owner;
    expect(await getClaudeToken(owner)).toBe(OLD);
  });

  it("rejects anonymous callers", async () => {
    await expect(restoreClaudeConnectionAction({ tokenEncrypted: "x", connectedAt: new Date().toISOString() })).rejects.toThrow(
      "Authentication required.",
    );
    await expect(connectClaudeAction({ token: TOKEN })).rejects.toThrow("Authentication required.");
    await expect(disconnectClaudeAction()).rejects.toThrow("Authentication required.");
  });
});
