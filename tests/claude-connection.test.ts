import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", async () => (await import("./auth")).authModule);
import { authState, seedUser } from "./auth";

import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { claudeConnections } from "@/db/schema";
import { connectClaudeAction, disconnectClaudeAction, restoreClaudeConnectionAction } from "@/actions/claude-connection";
import { decryptToken, encryptToken, getClaudeConnection, getClaudeToken } from "@/lib/claude-connection";
import { succeeded } from "./succeeded";
import { SIGNED_OUT } from "@/lib/validations/result";

const TOKEN = "sk-ant-oat01-test-token-abcdefghijklmnopqrstuvwxyz";

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

  it("refuses signed-out callers in people's words, before anything is read or written", async () => {
    const refused = { success: false, error: SIGNED_OUT };
    expect(await restoreClaudeConnectionAction({ tokenEncrypted: "x", connectedAt: new Date().toISOString() })).toEqual(refused);
    expect(await connectClaudeAction({ token: TOKEN })).toEqual(refused);
    expect(await disconnectClaudeAction()).toEqual(refused);
  });

  it("stores a restored date from the future as now [MORE-13]", async () => {
    const owner = await seedUser();
    authState.id = owner;
    const before = Date.now();
    const sealed = encryptToken(TOKEN);
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const back = succeeded(await restoreClaudeConnectionAction({ tokenEncrypted: sealed, connectedAt: future }));
    const stored = (await getClaudeConnection(owner))!.connectedAt.getTime();
    expect(stored).toBeGreaterThanOrEqual(before);
    expect(stored).toBeLessThanOrEqual(Date.now());
    expect(new Date(back.connectedAt).getTime()).toBe(stored);
    // A past date is kept as sent.
    const past = new Date(Date.now() - 3 * 86_400_000);
    await restoreClaudeConnectionAction({ tokenEncrypted: sealed, connectedAt: past.toISOString() });
    expect((await getClaudeConnection(owner))!.connectedAt.getTime()).toBe(past.getTime());
  });
});
