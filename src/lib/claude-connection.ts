import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { claudeConnections } from "@/db/schema";

// AES-256-GCM with a random 96-bit IV; "v1:" leaves room to change the scheme later (crypto agility).
const VERSION = "v1";

function key(): Buffer {
  const k = Buffer.from(process.env.CLAUDE_TOKEN_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("CLAUDE_TOKEN_KEY must be 32 bytes, base64-encoded.");
  return k;
}

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64"))).join(":");
}

export function decryptToken(stored: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unknown token format.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export async function saveClaudeToken(userId: string, token: string) {
  const tokenEncrypted = encryptToken(token);
  const [row] = await db
    .insert(claudeConnections)
    .values({ userId, tokenEncrypted })
    .onConflictDoUpdate({ target: claudeConnections.userId, set: { tokenEncrypted, connectedAt: new Date() } })
    .returning({ connectedAt: claudeConnections.connectedAt });
  return row;
}

/** What was stored before a replace or disconnect, still encrypted, so Undo can put it back; null when nothing was. */
export async function getStoredConnection(userId: string) {
  const [row] = await db
    .select({ tokenEncrypted: claudeConnections.tokenEncrypted, connectedAt: claudeConnections.connectedAt })
    .from(claudeConnections)
    .where(eq(claudeConnections.userId, userId));
  return row ?? null;
}

export async function deleteClaudeToken(userId: string) {
  await db.delete(claudeConnections).where(eq(claudeConnections.userId, userId));
}

/** Undo: writes a previously stored (encrypted) token back. It must still decrypt, or it is refused. */
export async function restoreClaudeConnection(userId: string, tokenEncrypted: string, connectedAt: Date) {
  decryptToken(tokenEncrypted);
  await db
    .insert(claudeConnections)
    .values({ userId, tokenEncrypted, connectedAt })
    .onConflictDoUpdate({ target: claudeConnections.userId, set: { tokenEncrypted, connectedAt } });
}

/** When the owner connected Claude, or null. Never returns the token. */
export async function getClaudeConnection(userId: string) {
  const [row] = await db
    .select({ connectedAt: claudeConnections.connectedAt })
    .from(claudeConnections)
    .where(eq(claudeConnections.userId, userId));
  return row ?? null;
}

/** The owner's decrypted token, server-side only; null when not connected. */
export async function getClaudeToken(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ tokenEncrypted: claudeConnections.tokenEncrypted })
    .from(claudeConnections)
    .where(eq(claudeConnections.userId, userId));
  return row ? decryptToken(row.tokenEncrypted) : null;
}
