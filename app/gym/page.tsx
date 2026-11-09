import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import {
  getDeloadStatus,
  getOpenWorkoutSession,
  getWorkoutHistory,
  getExercises,
  getUserSplitWithDays,
} from "@/lib/gym";
import { GymClient } from "./gym-client";
import { addDays, toISODate } from "@/lib/format-date";

export default async function GymPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const split = await getUserSplitWithDays(userId);
  const deload = await getDeloadStatus(userId);
  const exercises = await getExercises(userId);
  const openSince = addDays(toISODate(), -2);
  const open = await getOpenWorkoutSession(userId, openSince);
  const history = await getWorkoutHistory(userId, openSince);

  return (
    <GymClient
      userName={session.user.name ?? "User"}
      split={split}
      deload={deload}
      history={history}
      openSession={
        open && {
          id: open.session.id,
          date: open.session.date,
          isDeload: open.session.isDeload,
          splitDayId: open.session.splitDayId,
          splitDayName: open.splitDayName ?? undefined,
          sets: open.sets.map((s) => ({
            id: s.id,
            exerciseId: s.exerciseId,
            setOrder: s.setOrder,
            reps: s.reps,
            loadType: s.loadType,
            loadValue: s.loadValue,
            extraKg: s.extraKg,
            isFailure: s.isFailure,
            isPartial: s.isPartial,
            flagAnomaly: s.flagAnomaly,
            anomalyReason: s.anomalyReason,
            notes: s.notes,
          })),
        }
      }
      exercises={exercises.map(({ id, name, muscleGroup, equipmentType }) => ({ id, name, muscleGroup, equipmentType }))}
    />
  );
}
