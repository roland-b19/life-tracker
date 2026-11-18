import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth";
import { getClaudeConnection } from "@/lib/claude-connection";
import { isClaudeEnabled } from "@/lib/features";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  if (!isClaudeEnabled()) notFound();
  const user = await requirePageUser();

  const connection = await getClaudeConnection(user.id);

  return (
    <SettingsClient
      userName={user.name}
      initialConnectedAt={connection?.connectedAt.toISOString() ?? null}
    />
  );
}
