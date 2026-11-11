"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { uuid } from "@/lib/validations/common";
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
  deleteCustomExercise,
  deleteWorkoutSet,
  finishWorkoutSession,
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

// No revalidate for set edits: the client keeps its own state, and refetching the page on every set is the costliest call.
export async function logSetAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = logSetSchema.parse(rawInput);
  const set = await logWorkoutSet(userId, parsed);
  return { success: Boolean(set), set };
}

export async function deleteSetAction(setId: string) {
  const userId = await requireUser();
  const deleted = await deleteWorkoutSet(userId, uuid.parse(setId));
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

/** Undo of creating a custom exercise; false when a routine or a set already uses it. */
export async function deleteCustomExerciseAction(exerciseId: string) {
  const userId = await requireUser();
  const deleted = await deleteCustomExercise(userId, uuid.parse(exerciseId));
  if (deleted) safeRevalidate("/gym");
  return { success: deleted };
}

/** The user's sets from the last year, for the Progress view. */
export async function getGymHistoryAction() {
  const userId = await requireUser();
  return { success: true, sets: await getGymHistory(userId, addDays(toISODate(), -370)) };
}
