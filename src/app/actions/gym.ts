"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { addDays, toISODate } from "@/lib/format-date";
import { uuid } from "@/lib/validations/common";
import {
  cancelSessionSchema,
  createCustomExerciseSchema,
  customExerciseWithIdSchema,
  createSessionSchema,
  finishSessionSchema,
  logSetSchema,
  restoreSessionSchema,
  saveDeloadWeeksSchema,
  saveSplitDaySchema,
} from "@/lib/validations/gym";
import type { ZodType } from "zod";
import {
  GymRefusal,
  cancelWorkoutSession,
  createCustomExercise,
  createWorkoutSession,
  deleteCustomExercise,
  restoreCustomExercise,
  updateCustomExercise,
  deleteWorkoutSet,
  finishWorkoutSession,
  logWorkoutSet,
  reopenWorkoutSession,
  restoreWorkoutSession,
  saveDeloadWeeks,
  saveSplitDay,
} from "@/lib/gym";

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // No-op outside Next.js request store (e.g. unit/integration tests)
  }
}

/** What the user typed is checked here and answered with the form's own message; a bad request from anything else still throws. */
function check<T>(schema: ZodType<T>, raw: unknown): { ok: true; value: T } | { ok: false; error: string } {
  const r = schema.safeParse(raw);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.issues[0]?.message ?? "Invalid input." };
}

/** A rule of the page (a workout is already open, a name is taken) is an answer for the form, not a crash. */
async function refusable<T extends object>(run: () => Promise<T>): Promise<T | { success: false; error: string }> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof GymRefusal) return { success: false, error: e.message };
    throw e;
  }
}

/** A workout is made today; a day either side covers the user's timezone and a page left open past midnight. */
function nearToday(date: string, daysBack = 1) {
  const today = toISODate();
  return date >= addDays(today, -daysBack) && date <= addDays(today, 1);
}

export async function startSessionAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = createSessionSchema.parse(rawInput);
  if (!nearToday(parsed.date)) return { success: false as const, error: "A workout can only be started for today." };
  return refusable(async () => {
    const session = await createWorkoutSession(userId, parsed);
    safeRevalidate("/gym");
    return { success: true as const, session };
  });
}

export async function finishSessionAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = check(finishSessionSchema, rawInput);
  if (!parsed.ok) return { success: false as const, error: parsed.error };
  const session = await finishWorkoutSession(userId, parsed.value);
  if (!session) return { success: false as const, error: "Workout not found." };
  safeRevalidate("/gym");
  return { success: true as const, session };
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
  // A workout is cancelled the day it was made, so Undo never brings one back from long ago.
  const details = nearToday(parsed.date, 7) ? await restoreWorkoutSession(userId, parsed) : null;
  if (details) safeRevalidate("/gym");
  return { success: Boolean(details), details };
}

// No revalidate for set edits: the client keeps its own state, and refetching the page on every set is the costliest call.
export async function logSetAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = check(logSetSchema, rawInput);
  if (!parsed.ok) return { success: false as const, error: parsed.error, set: null };
  const set = await logWorkoutSet(userId, parsed.value);
  return { success: Boolean(set), set };
}

export async function deleteSetAction(setId: string) {
  const userId = await requireUser();
  const deleted = await deleteWorkoutSet(userId, uuid.parse(setId));
  return { success: Boolean(deleted), deleted };
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
  const parsed = check(createCustomExerciseSchema, rawInput);
  if (!parsed.ok) return { success: false as const, error: parsed.error };
  return refusable(async () => {
    const exercise = await createCustomExercise(userId, parsed.value);
    safeRevalidate("/gym");
    return { success: true as const, exercise };
  });
}

/** Edit of a custom exercise, and the Undo of that edit (it sends the old values). */
export async function updateCustomExerciseAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = check(customExerciseWithIdSchema, rawInput);
  if (!parsed.ok) return { success: false as const, error: parsed.error };
  return refusable(async () => {
    const exercise = await updateCustomExercise(userId, parsed.value);
    if (!exercise) return { success: false as const, error: "Exercise not found." };
    safeRevalidate("/gym");
    return { success: true as const, exercise };
  });
}

/** Undo of deleting a custom exercise: the same row comes back. */
export async function restoreCustomExerciseAction(rawInput: unknown) {
  const userId = await requireUser();
  const parsed = check(customExerciseWithIdSchema, rawInput);
  if (!parsed.ok) return { success: false as const, error: parsed.error };
  return refusable(async () => {
    const exercise = await restoreCustomExercise(userId, parsed.value);
    if (!exercise) return { success: false as const, error: "Exercise could not be restored." };
    safeRevalidate("/gym");
    return { success: true as const, exercise };
  });
}

/** Delete of a custom exercise, and the Undo of creating one; false when a routine or a set already uses it. */
export async function deleteCustomExerciseAction(exerciseId: string) {
  const userId = await requireUser();
  const deleted = await deleteCustomExercise(userId, uuid.parse(exerciseId));
  if (deleted) safeRevalidate("/gym");
  return { success: deleted };
}

/** Sets the last and next deload week; Undo sends the previous pair through the same action. */
export async function saveDeloadWeeksAction(rawInput: unknown) {
  const userId = await requireUser();
  const saved = await saveDeloadWeeks(userId, saveDeloadWeeksSchema.parse(rawInput));
  safeRevalidate("/gym");
  return { success: true, ...saved };
}
