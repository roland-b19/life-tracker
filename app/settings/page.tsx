import { requirePageUser } from "@/server/auth";
import { getClaudeConnection } from "@/lib/claude-connection";
import { isClaudeEnabled } from "@/lib/features";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const user = await requirePageUser();

  // Settings is always shown (Appearance); only the Claude card and its data sit behind the flag.
  const connection = isClaudeEnabled() ? await getClaudeConnection(user.id) : null;

  return (
    <SettingsClient
      userName={user.name}
      initialConnectedAt={connection?.connectedAt.toISOString() ?? null}
    />
  );
}
