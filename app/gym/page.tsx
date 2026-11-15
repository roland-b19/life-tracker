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
import { progressSets, withProgress } from "@/lib/gym-progress";

export default async function GymPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin");
  }

  const userId = session.user.id;
  const openSince = addDays(toISODate(), -2);
  // Same year of sets the Exercise progress card draws from, so a workout's figures match its Exercise progress chart.
  const since = addDays(toISODate(), -370);
  const [split, exercises, deload, open, workouts] = await Promise.all([
    getUserSplitWithDays(userId),
    getExercises(userId),
    getDeloadStatus(userId),
    getOpenWorkoutSession(userId, openSince),
    getWorkoutHistory(userId, openSince, since),
  ]);
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  const history = withProgress(workouts, progressSets(workouts, open && { ...open.session, splitDayName: open.splitDayName, sets: open.sets }, names));

  return (
    <GymClient
      userName={session.user.name ?? "User"}
      split={split}
      deload={deload}
      history={history}
      openSession={
        open && {
          id: open.session.id,
          createdAt: open.session.createdAt,
          date: open.session.date,
          isDeload: open.session.isDeload,
          splitDayId: open.session.splitDayId,
          splitDayName: open.splitDayName ?? undefined,
          sets: open.sets.map((s) => ({
            id: s.id,
            createdAt: s.createdAt,
            exerciseId: s.exerciseId,
            setOrder: s.setOrder,
            reps: s.reps,
            loadType: s.loadType,
            loadValue: s.loadValue,
            extraKg: s.extraKg,
            isFailure: s.isFailure,
            isPartial: s.isPartial,
            isGoodForm: s.isGoodForm,
            flagAnomaly: s.flagAnomaly,
            anomalyReason: s.anomalyReason,
            notes: s.notes,
          })),
        }
      }
      exercises={exercises.map(({ id, name, muscleGroup, equipmentType }) => ({ id, name, muscleGroup, equipmentType }))}
      customExercises={exercises.filter((e) => e.isCustom).map(({ id, name, muscleGroup, equipmentType }) => ({ id, name, muscleGroup, equipmentType }))}
    />
  );
}
