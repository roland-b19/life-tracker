"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import {
  generateApiToken,
  listApiTokens,
  revokeApiToken,
} from "@/lib/api-tokens";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // No-op in test runner
  }
}

export async function generateFoodTokenAction(name?: string) {
  const userId = await requireUser();
  const token = await generateApiToken(userId, name);
  safeRevalidate("/food");
  return { success: true, token };
}

export async function listFoodTokensAction() {
  const userId = await requireUser();
  const tokens = await listApiTokens(userId);
  return { success: true, tokens };
}

export async function revokeFoodTokenAction(tokenId: string) {
  const userId = await requireUser();
  if (!tokenId || typeof tokenId !== "string") {
    throw new Error("Invalid token ID");
  }
  const revoked = await revokeApiToken(userId, tokenId);
  safeRevalidate("/food");
  return { success: true, revoked };
}
