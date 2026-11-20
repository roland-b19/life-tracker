"use server";

import { requireUser } from "@/server/auth";
import { addDays, toISODate } from "@/lib/format-date";
import { uuid } from "@/lib/validations/common";
import {
  cancelSessionSchema,
  addCustomExerciseSchema,
  customExerciseWithIdSchema,
  addSessionSchema,
  finishSessionSchema,
  logSetSchema,
  restoreDeloadWeeksSchema,
  restoreSessionSchema,
  saveDeloadWeeksSchema,
  saveSplitDaySchema,
} from "@/lib/validations/gym";
import { Refusal, respond } from "@/lib/validations/result";
import {
  cancelWorkoutSession,
  addCustomExercise,
  addWorkoutSession,
  deleteCustomExercise,
  restoreCustomExercise,
  updateCustomExercise,
  deleteWorkoutSet,
  finishWorkoutSession,
  logWorkoutSet,
  reopenWorkoutSession,
  restoreDeloadWeeks,
  restoreWorkoutSession,
  saveDeloadWeeks,
  saveSplitDay,
} from "@/lib/gym";

/** A workout is made today; a day either side covers the user's timezone and a page left open past midnight. */
function nearToday(date: string, daysBack = 1) {
  const today = toISODate();
  return date >= addDays(today, -daysBack) && date <= addDays(today, 1);
}

/** What a custom exercise that is gone (deleted in another tab, say) answers. */
const EXERCISE_GONE = "This exercise no longer exists.";

export async function startSessionAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const parsed = addSessionSchema.parse(rawInput);
    if (!nearToday(parsed.date)) throw new Refusal("A workout can only be started for today.");
    const session = await addWorkoutSession(userId, parsed);
    return { session };
  });
}

export async function finishSessionAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const session = await finishWorkoutSession(userId, finishSessionSchema.parse(rawInput));
    if (!session) throw new Refusal("Workout not found.");
    return { session };
  });
}

export async function cancelSessionAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const { sessionId } = cancelSessionSchema.parse(rawInput);
    const deleted = await cancelWorkoutSession(userId, sessionId);
    if (!deleted) throw new Refusal("Workout not found.");
    return {};
  });
}

/** Undo of Finish: the workout is open again. */
export async function reopenSessionAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const { sessionId } = cancelSessionSchema.parse(rawInput);
    if (!(await reopenWorkoutSession(userId, sessionId))) throw new Refusal("Workout not found.");
    return {};
  });
}

/** Undo of Cancel: the workout and its sets come back (open, with new ids). */
export async function restoreSessionAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const parsed = restoreSessionSchema.parse(rawInput);
    // A workout is cancelled the day it was made, so Undo never brings one back from long ago.
    const details = nearToday(parsed.date, 7) ? await restoreWorkoutSession(userId, parsed) : null;
    if (!details) throw new Refusal("This workout could not be restored.");
    return { details };
  });
}

export async function logSetAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const set = await logWorkoutSet(userId, logSetSchema.parse(rawInput));
    if (!set) throw new Refusal("This set could not be saved.");
    return { set };
  });
}

export async function deleteSetAction(setId: string) {
  return respond(async () => {
    const userId = await requireUser();
    const deleted = await deleteWorkoutSet(userId, uuid.parse(setId));
    if (!deleted) throw new Refusal("Set not found.");
    return { deleted };
  });
}

export async function saveSplitDayAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    if (!(await saveSplitDay(userId, saveSplitDaySchema.parse(rawInput)))) throw new Refusal("This day could not be saved.");
    return {};
  });
}

export async function addCustomExerciseAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const exercise = await addCustomExercise(userId, addCustomExerciseSchema.parse(rawInput));
    if (!exercise) throw new Refusal("This exercise could not be saved.");
    return { exercise };
  });
}

/** Edit of a custom exercise, and the Undo of that edit (it sends the old values). */
export async function updateCustomExerciseAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const exercise = await updateCustomExercise(userId, customExerciseWithIdSchema.parse(rawInput));
    if (!exercise) throw new Refusal(EXERCISE_GONE);
    return { exercise };
  });
}

/** Undo of deleting a custom exercise: the same row comes back. */
export async function restoreCustomExerciseAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const exercise = await restoreCustomExercise(userId, customExerciseWithIdSchema.parse(rawInput));
    if (!exercise) throw new Refusal("Exercise could not be restored.");
    return { exercise };
  });
}

/** Delete of a custom exercise, and the Undo of creating one; refused when a routine or a set already uses it. */
export async function deleteCustomExerciseAction(exerciseId: string) {
  return respond(async () => {
    const userId = await requireUser();
    const outcome = await deleteCustomExercise(userId, uuid.parse(exerciseId));
    if (outcome === "missing") throw new Refusal(EXERCISE_GONE);
    if (outcome === "in-use") throw new Refusal("This exercise is used by a routine or a workout, so it stays.");
    return {};
  });
}

/** Sets the last and next deload week; answers the weeks it added and removed, which Undo sends back. */
export async function saveDeloadWeeksAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    return saveDeloadWeeks(userId, saveDeloadWeeksSchema.parse(rawInput));
  });
}

/** Undo of saving the deload weeks: what that save removed comes back and what it added goes. */
export async function restoreDeloadWeeksAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    await restoreDeloadWeeks(userId, restoreDeloadWeeksSchema.parse(rawInput));
    return {};
  });
}
