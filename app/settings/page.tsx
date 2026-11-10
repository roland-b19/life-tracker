import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { getClaudeConnection } from "@/lib/claude-connection";
import { isClaudeEnabled } from "@/lib/features";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  if (!isClaudeEnabled()) notFound();
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
