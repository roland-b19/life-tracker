"use server";

import { requireUser } from "@/server/auth";
import { addDays, toISODate } from "@/lib/format-date";
import { uuid } from "@/lib/validations/common";
import {
  addCustomExerciseSchema,
  customExerciseWithIdSchema,
  addSessionSchema,
  finishSessionSchema,
  logSetSchema,
  restoreDeloadWeeksSchema,
  restoreSessionSchema,
  saveDeloadWeeksSchema,
  savePlateWeightSchema,
  saveSessionNotesSchema,
  saveSplitDaySchema,
  sessionIdSchema,
  SET_GONE,
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
  savePlateWeight,
  saveSplitDay,
  saveWorkoutNotes,
  setWorkoutTimer,
  EXERCISE_GONE,
  WORKOUT_GONE,
} from "@/lib/gym";

/** A workout is made today; a day either side covers the user's timezone and a page left open past midnight. */
function nearToday(date: string, daysBack = 1) {
  const today = toISODate();
  return date >= addDays(today, -daysBack) && date <= addDays(today, 1);
}

/**
 * Start a workout on a training day (D-039): one per day, so a day that already has one gets it back, open and timing.
 * Answers the workout with its sets and timer, and `from`: how it was found, which Undo reverses.
 */
export async function startSessionAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const parsed = addSessionSchema.parse(rawInput);
    if (!nearToday(parsed.date)) throw new Refusal("A workout can only be started for today.");
    const started = await addWorkoutSession(userId, parsed);
    if (!started) throw new Refusal("This workout could not be started.");
    return started;
  });
}

/** Pause the workout's timer (also Exit, finish later); answers the timer. */
export async function pauseSessionAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const timer = await setWorkoutTimer(userId, sessionIdSchema.parse(rawInput).sessionId, false);
    if (!timer) throw new Refusal(WORKOUT_GONE);
    return { timer };
  });
}

/** Resume the workout's timer; answers the timer. */
export async function resumeSessionAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const timer = await setWorkoutTimer(userId, sessionIdSchema.parse(rawInput).sessionId, true);
    if (!timer) throw new Refusal(WORKOUT_GONE);
    return { timer };
  });
}

/** Finish: the server counts the duration. A workout with no sets is deleted instead (`deleted`), and Undo restores it. */
export async function finishSessionAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const finished = await finishWorkoutSession(userId, finishSessionSchema.parse(rawInput));
    if (!finished) throw new Refusal(WORKOUT_GONE);
    return finished;
  });
}

/** Save an open workout's notes as they change (D-040: the notes the screen showed and the new ones); answers the notes saved. */
export async function saveSessionNotesAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const saved = await saveWorkoutNotes(userId, saveSessionNotesSchema.parse(rawInput));
    if (!saved) throw new Refusal(WORKOUT_GONE);
    return saved;
  });
}

/** Cancel: an open workout and its sets go (a finished one is refused); answers its timer, which Undo puts back. */
export async function cancelSessionAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const { sessionId } = sessionIdSchema.parse(rawInput);
    const deleted = await cancelWorkoutSession(userId, sessionId);
    if (!deleted) throw new Refusal(WORKOUT_GONE);
    return { timer: deleted.timer };
  });
}

/** Undo of Finish: the workout is open again and its timer runs on; answers the timer. */
export async function reopenSessionAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const { sessionId } = sessionIdSchema.parse(rawInput);
    const reopened = await reopenWorkoutSession(userId, sessionId);
    if (!reopened) throw new Refusal(WORKOUT_GONE);
    return reopened;
  });
}

/** Undo of Cancel, and of a Finish that deleted an empty workout: the workout comes back open, with its sets, ids and timer. */
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
    if (!deleted) throw new Refusal(SET_GONE);
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

/** "1 plate = X kg" for one exercise (D-038), and the Undo of that save (it sends the old kg, null for none); answers the kg it had before. */
export async function savePlateWeightAction(rawInput: unknown) {
  return respond(async () => {
    const userId = await requireUser();
    const saved = await savePlateWeight(userId, savePlateWeightSchema.parse(rawInput));
    if (!saved) throw new Refusal(EXERCISE_GONE);
    return saved;
  });
}
