import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { getClaudeConnection } from "@/lib/claude-connection";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const connection = await getClaudeConnection(session.user.id);

  return (
    <SettingsClient
      userName={session.user.name ?? "User"}
      initialConnectedAt={connection?.connectedAt.toISOString() ?? null}
    />
  );
}
