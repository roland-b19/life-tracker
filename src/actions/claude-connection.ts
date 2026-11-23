"use server";

import { z } from "zod";
import { requireUser } from "@/server/auth";
import { assertClaudeEnabled } from "@/lib/features";
import { deleteClaudeToken, getStoredConnection, restoreClaudeConnection, saveClaudeToken } from "@/lib/claude-connection";
import { respond } from "@/lib/validations/result";

// The long-lived OAuth token printed by `claude setup-token`.
const TOKEN_HINT = "Please paste the token that claude setup-token prints";
const tokenSchema = z.object({
  token: z.string(TOKEN_HINT).trim().regex(/^sk-ant-[A-Za-z0-9_-]{20,500}$/, TOKEN_HINT),
});

export async function connectClaudeAction(rawInput: unknown) {
  assertClaudeEnabled();
  return respond(async () => {
    const userId = await requireUser();
    const { token } = tokenSchema.parse(rawInput);
    const previous = await getStoredConnection(userId);
    const { connectedAt } = await saveClaudeToken(userId, token);
    return { connectedAt: connectedAt.toISOString(), previous: sealed(previous) };
  });
}

export async function disconnectClaudeAction() {
  assertClaudeEnabled();
  return respond(async () => {
    const userId = await requireUser();
    const previous = await getStoredConnection(userId);
    await deleteClaudeToken(userId);
    return { previous: sealed(previous) };
  });
}

// What Undo needs to put a token back: the stored ciphertext, never the token itself. Only the server key opens it.
const sealed = (row: { tokenEncrypted: string; connectedAt: Date } | null) =>
  row && { tokenEncrypted: row.tokenEncrypted, connectedAt: row.connectedAt.toISOString() };

const restoreSchema = z.object({ tokenEncrypted: z.string().max(2000), connectedAt: z.string().datetime() });

export async function restoreClaudeConnectionAction(rawInput: unknown) {
  assertClaudeEnabled();
  return respond(async () => {
    const userId = await requireUser();
    const { tokenEncrypted, connectedAt } = restoreSchema.parse(rawInput);
    const restoredAt = await restoreClaudeConnection(userId, tokenEncrypted, new Date(connectedAt));
    return { connectedAt: restoredAt.toISOString() };
  });
}
