"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import {
  createCustomExerciseSchema,
  createSessionSchema,
  finishSessionSchema,
  logSetSchema,
  saveSplitDaySchema,
} from "@/lib/validations/gym";
import {
  createCustomExercise,
  createWorkoutSession,
  deleteWorkoutSet,
  finishWorkoutSession,
  getExerciseContext,
  logWorkoutSet,
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
