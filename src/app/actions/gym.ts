"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { addDays, toISODate } from "@/lib/format-date";
import {
  cancelSessionSchema,
  createCustomExerciseSchema,
  createSessionSchema,
  finishSessionSchema,
  logSetSchema,
  restoreSessionSchema,
  saveSplitDaySchema,
} from "@/lib/validations/gym";
import {
  cancelWorkoutSession,
  createCustomExercise,
  createWorkoutSession,
  deleteWorkoutSet,
  finishWorkoutSession,
  getExerciseContext,
  getGymHistory,
  logWorkoutSet,
  reopenWorkoutSession,
  restoreWorkoutSession,
  saveSplitDay,
} from "@/lib/gym";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // No-op outside Next.js request store (e.g. unit/integration tests)
  }
}

export async function startSessionAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = createSessionSchema.parse(rawInput);
  const session = await createWorkoutSession(userId, parsed);
  safeRevalidate("/gym");
  return { success: true, session };
}

export async function finishSessionAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = finishSessionSchema.parse(rawInput);
  const session = await finishWorkoutSession(userId, parsed);
  safeRevalidate("/gym");
  return { success: true, session };
}

export async function cancelSessionAction(rawInput: unknown) {
  const userId = await requireUser();
  const { sessionId } = cancelSessionSchema.parse(rawInput);
  const deleted = await cancelWorkoutSession(userId, sessionId);
  safeRevalidate("/gym");
  return { success: Boolean(deleted) };
}

/** Undo of Finish: the workout is open again. */
export async function reopenSessionAction(rawInput: unknown) {
  const userId = await requireUser();
  const { sessionId } = cancelSessionSchema.parse(rawInput);
  const reopened = await reopenWorkoutSession(userId, sessionId);
  safeRevalidate("/gym");
  return { success: Boolean(reopened) };
}

/** Undo of Cancel: the workout and its sets come back (open, with new ids). */
export async function restoreSessionAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = restoreSessionSchema.parse(rawInput);
  const details = await restoreWorkoutSession(userId, parsed);
  if (details) safeRevalidate("/gym");
  return { success: Boolean(details), details };
}

export async function logSetAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = logSetSchema.parse(rawInput);
  const set = await logWorkoutSet(userId, parsed);
  safeRevalidate("/gym");
  return { success: true, set };
}

export async function deleteSetAction(setId: string) {
  const userId = await requireUser();
  if (!setId || typeof setId !== "string") {
    throw new Error("Invalid set ID");
  }
  const deleted = await deleteWorkoutSet(userId, setId);
  safeRevalidate("/gym");
  return { success: true, deleted };
}

export async function saveSplitDayAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = saveSplitDaySchema.parse(rawInput);
  const saved = await saveSplitDay(userId, parsed);
  if (saved) safeRevalidate("/gym");
  return { success: saved };
}

export async function createCustomExerciseAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = createCustomExerciseSchema.parse(rawInput);
  const exercise = await createCustomExercise(userId, parsed);
  safeRevalidate("/gym");
  return { success: true, exercise };
}

export async function getExerciseContextAction(
  exerciseId: string,
  currentSessionId?: string,
  maxTargetReps?: number,
) {
  const userId = await requireUser();
  if (!exerciseId || typeof exerciseId !== "string") {
    throw new Error("Invalid exercise ID");
  }
  const context = await getExerciseContext(
    userId,
    exerciseId,
    currentSessionId,
    maxTargetReps,
  );
  return { success: true, context };
}

/** The user's sets from the last year, for the Progress view. */
export async function getGymHistoryAction() {
  const userId = await requireUser();
  return { success: true, sets: await getGymHistory(userId, addDays(toISODate(), -370)) };
}
