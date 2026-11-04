import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { apiTokens } from "@/db/schema";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function generateApiToken(
  userId: string,
  name = "Claude / Gemini Food Connector",
) {
  // Prefix 'lt_food_' so it's clearly identifiable
  const randomSecret = randomBytes(24).toString("hex");
  const plaintextToken = `lt_food_${randomSecret}`;
  const tokenHash = hashToken(plaintextToken);

  const [created] = await db
    .insert(apiTokens)
    .values({
      userId,
      name,
      tokenHash,
      scope: "food",
    })
    .returning();

  return {
    id: created.id,
    name: created.name,
    scope: created.scope,
    plaintextToken,
    createdAt: created.createdAt,
  };
}

export async function verifyApiToken(plaintextToken: string): Promise<string | null> {
  if (process.env.AI_CONNECTOR_ENABLED === "false") {
    throw new Error("AI Connector is temporarily disabled by administrator.");
  }

  if (!plaintextToken || typeof plaintextToken !== "string") {
    return null;
  }

  const tokenHash = hashToken(plaintextToken);
  const [tokenRecord] = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, tokenHash));

  if (!tokenRecord) {
    return null;
  }

  // Update lastUsedAt asynchronously
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, tokenRecord.id));

  return tokenRecord.userId;
}

export async function listApiTokens(userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      scope: apiTokens.scope,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));
}

export async function revokeApiToken(userId: string, tokenId: string): Promise<boolean> {
  const deleted = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)))
    .returning({ id: apiTokens.id });

  return deleted.length > 0;
}
