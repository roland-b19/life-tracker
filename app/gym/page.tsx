import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import {
  getDeloadStatus,
  getRecentWorkoutSessions,
  getUserSplitWithDays,
} from "@/lib/gym";
import { GymClient } from "./gym-client";

export default async function GymPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const split = await getUserSplitWithDays(userId);
  const deload = await getDeloadStatus(userId);
  const recentSessions = await getRecentWorkoutSessions(userId);

  return (
    <GymClient
      userName={session.user.name ?? "User"}
      split={split}
      deload={deload}
      recentSessions={recentSessions}
    />
  );
}
