"use server";

import { z } from "zod";
import { requireUser } from "@/server/auth";
import { assertClaudeEnabled } from "@/lib/features";
import { deleteClaudeToken, saveClaudeToken } from "@/lib/claude-connection";

// The long-lived OAuth token printed by `claude setup-token`.
const tokenSchema = z.object({ token: z.string().trim().regex(/^sk-ant-[A-Za-z0-9_-]{20,500}$/) });

export async function connectClaudeAction(input: z.input<typeof tokenSchema>) {
  assertClaudeEnabled();
  const userId = await requireUser();
  const parsed = tokenSchema.safeParse(input);
  if (!parsed.success) return { error: "Please paste the token that claude setup-token prints." };
  const { connectedAt } = await saveClaudeToken(userId, parsed.data.token);
  return { connectedAt: connectedAt.toISOString() };
}

export async function disconnectClaudeAction() {
  assertClaudeEnabled();
  await deleteClaudeToken(await requireUser());
}
