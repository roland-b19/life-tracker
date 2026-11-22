import { headers } from "next/headers";
import { requirePageUser } from "@/server/auth";
import {
  getDeloadStatus,
  getOpenWorkoutSession,
  getWorkoutHistory,
  getExercises,
  getPlateWeights,
  getUserSplitWithDays,
} from "@/lib/gym";
import { GymClient } from "./gym-client";
import { addDays, toISODate } from "@/lib/format-date";
import { deloadWeeksIn, progressSets, withProgress } from "@/lib/gym-progress";

export default async function GymPage() {
  const user = await requirePageUser("/gym");

  // The server's day: the page renders from it on the server and in the browser alike (the browser's clock may differ).
  const today = toISODate();
  // Same year of sets the Exercise progress card draws from, so a workout's figures match its Exercise progress chart.
  const since = addDays(today, -370);
  const [split, exercises, deload, open, workouts, plateWeights] = await Promise.all([
    getUserSplitWithDays(user.id),
    getExercises(user.id),
    getDeloadStatus(user.id),
    getOpenWorkoutSession(user.id),
    getWorkoutHistory(user.id, since),
    getPlateWeights(user.id),
  ]);
  // The refresh this page is rendered for (`app/providers.tsx`; 0 when it is not a refresh).
  const refresh = Number((await headers()).get("x-refresh")) || 0;
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  const sets = progressSets(workouts, open && { ...open.session, splitDayName: open.splitDayName, sets: open.sets }, names);
  const history = withProgress(workouts, sets, { plates: plateWeights, deload: deloadWeeksIn(deload.weeks, sets) });

  return (
    <GymClient
      userName={user.name}
      today={today}
      plateWeights={plateWeights}
      split={split}
      deload={deload}
      history={history}
      refresh={refresh}
      openSession={
        open && {
          id: open.session.id,
          timer: open.timer,
          createdAt: open.session.createdAt,
          date: open.session.date,
          isDeload: open.session.isDeload,
          splitDayId: open.session.splitDayId,
          splitDayName: open.splitDayName ?? undefined,
          notes: open.session.notes,
          sets: open.sets.map((s) => ({
            id: s.id,
            createdAt: s.createdAt,
            exerciseId: s.exerciseId,
            exerciseName: s.exerciseName,
            muscleGroup: s.muscleGroup,
            equipmentType: s.equipmentType,
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
