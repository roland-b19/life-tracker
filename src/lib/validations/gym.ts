import { z } from "zod";
import { FUTURE_DATE, isoDate, newId, TWO_DECIMALS, twoDecimals, uuid, visible } from "./common";
import { weekday } from "@/lib/format-date";
import { MUSCLE_GROUP_KEYS } from "@/lib/gym-muscles";
import { formatNumber } from "@/lib/number-format";

/**
 * The limits of a logged set, one plate's kg, the sets of one exercise in a workout, a set's and a workout's note, an exercise's name
 * and a day's name (the varchar(255), varchar(500), varchar(120) and varchar(100) columns), and a day's routine (target
 * sets and reps of each exercise), shared by the forms and the server.
 */
export const GYM_LIMITS = {
  reps: 200,
  load: 1000,
  extra: 300,
  plateKg: 100,
  sets: 50,
  setNotes: 255,
  sessionNotes: 500,
  exerciseName: 120,
  dayName: 100,
  targetSets: 10,
  targetReps: 100,
} as const;
/** The fewest characters of an exercise's name. */
export const EXERCISE_NAME_MIN = 2;

/** What a weight below zero answers, in the set form and on the server. */
export const NOT_NEGATIVE = "Can't be negative";
/** What a set's reps outside 1 to the limit, or not whole, answer, in the set form and on the server. */
export const REPS_RANGE = `Reps must be a whole number from 1 to ${GYM_LIMITS.reps}`;
/** What a set's weight above the limit answers, in the set form and on the server. */
export const AT_MOST_LOAD = `Value can be at most ${formatNumber(GYM_LIMITS.load)}`;
/** What a routine's target sets or reps outside their limits, or not whole, answer, in the day editor and on the server. */
export const ROUTINE_RANGE = `Sets must be whole numbers from 1 to ${GYM_LIMITS.targetSets} and reps from 1 to ${GYM_LIMITS.targetReps}`;
/** What a routine row whose min reps are above its max reps answers, in the day editor and on the server. */
export const MIN_OVER_MAX = "Min reps must not exceed max reps";
/** What a day's or an exercise's name with nothing visible answers, in the gym forms and on the server. */
export const NAME_REQUIRED = "Name is required";
/** What an exercise name shorter than the minimum answers, in the new exercise form and on the server. */
export const NAME_TOO_SHORT = `The name must have at least ${EXERCISE_NAME_MIN} characters`;
/** What a next deload week not after the last one answers, in the deload dialog and on the server. */
export const DELOAD_ORDER = "The next deload must come after the last one";
/** What a plate weight of 0 or less answers, in the plate weight form and on the server. */
export const MORE_THAN_ZERO = "Must be more than 0";
/** What a plate weight above the limit answers, in the plate weight form and on the server. */
export const AT_MOST_PLATE_KG = `Must be at most ${GYM_LIMITS.plateKg}`;
/** Why a kg or plates set with a value of 0 cannot be logged (a bodyweight set can), in the set form and on the server. */
export const ZERO_LOAD = "Enter a value above 0, or pick BW";
/**
 * What a change of a workout's notes answers when the stored notes are no longer the ones the screen showed (D-040): the
 * client then takes the server's notes as the ones its next save changes from.
 */
export const NOTES_CHANGED = "These notes changed on another device. Check them and try again.";
/** What a set, a Finish, a Pause or a Resume on a finished workout answers (D-039): it is history now. */
export const WORKOUT_FINISHED = "This workout is already finished.";
/** What a workout that is not the user's (or no longer there) answers: the same words whoever owns it. */
export const WORKOUT_GONE = "Workout not found.";
/**
 * What the page says when the workout in hand ended elsewhere (finished or cancelled on another device or in another
 * tab): seen on a refresh (D-034), or as the reason a write of it was refused (`WORKOUT_FINISHED`, `WORKOUT_GONE`).
 */
export const WORKOUT_ENDED_ELSEWHERE = "This workout was finished or cancelled elsewhere.";
/** What deleting a set that is no longer there answers: the client then has nothing to put back. */
export const SET_GONE = "Set not found.";
/** What the Undo of "Started" answers when the workout has a set, logged here or on another device: it deletes nothing. */
export const SETS_LOGGED = "Sets are logged; use Cancel workout instead.";
/** A set's weight: at least 0, at most `max` (answering `tooBig` above it), with at most two decimals. */
const weight = (max: number, tooBig?: string) => z.number().min(0, NOT_NEGATIVE).max(max, tooBig).refine(twoDecimals, TWO_DECIMALS);

/** How far a set's time may sit outside its workout (before its start, after now): the device's clock may run a little off. */
export const SET_TIME_SKEW_MS = 60_000;

/** A note: trimmed, at most `max` characters, and null when nothing visible is left. */
const note = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (visible(s) ? s : null))
    .nullish();

/**
 * A workout's notes as the server saves them (trimmed; null when nothing visible is left). The notes field compares its
 * text with this too, so it sends nothing the server would answer with "Nothing to save".
 */
export const sessionNote = note(GYM_LIMITS.sessionNotes);

/**
 * The spaces an exercise name collapses, as one regular expression for both sides: `exerciseNameKey` here and `nameKey`
 * in `src/lib/gym.ts`, which hands this same text to Postgres. A list, not `\s`: JavaScript's `\s` takes every Unicode
 * space and Postgres's takes a different set (not the no-break space), so the two would split one name into two.
 */
export const NAME_SPACES = "[ \\t\\n\\v\\f\\r\\u00a0]+";

/**
 * An exercise name as two names are compared: inner spaces collapsed, case and a trailing "." ignored, so "Bench  press",
 * "bench press." and "BENCH PRESS" are one name. The server compares the same way in SQL (`nameKey` in `src/lib/gym.ts`).
 */
export const exerciseNameKey = (name: string) =>
  name
    .replace(new RegExp(NAME_SPACES, "g"), " ")
    .replace(/^ | $/g, "")
    .replace(/ ?\.$/, "")
    .toLowerCase();

const setFields = z.object({
  // The device makes the id (D-040); Undo also sends the time and the set's number, to bring a deleted set back as it
  // was (the number after the highest when a set logged meanwhile took its own). The server checks the time falls within the
  // workout, and numbers a new set itself (D-040: a log sends only what the device knows, so two devices never pick one number).
  id: newId,
  createdAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + SET_TIME_SKEW_MS, FUTURE_DATE).optional(),
  sessionId: uuid,
  exerciseId: uuid,
  setOrder: z.number().int().min(1).max(GYM_LIMITS.sets).optional(),
  reps: z.number().int(REPS_RANGE).min(1, REPS_RANGE).max(GYM_LIMITS.reps, REPS_RANGE),
  loadType: z.enum(["kg", "plates", "bodyweight"]),
  loadValue: weight(GYM_LIMITS.load, AT_MOST_LOAD),
  extraKg: weight(GYM_LIMITS.extra).default(0),
  isFailure: z.boolean().default(true),
  isPartial: z.boolean().default(false),
  isGoodForm: z.boolean().default(true),
  flagAnomaly: z.boolean().default(false),
  anomalyReason: z.enum(["too_heavy", "pain", "form", "other"]).optional().nullable(),
  notes: note(GYM_LIMITS.setNotes),
});

/** A new set: a kg or plates set needs a value above 0, as in the set form; a bodyweight set may add nothing. */
export const logSetSchema = setFields.refine((s) => s.loadType === "bodyweight" || s.loadValue > 0, { message: ZERO_LOAD, path: ["loadValue"] });

/** "1 plate = X kg" for one exercise (D-038): above 0, the column's two decimals; null clears it (the Undo of a first save). */
export const savePlateWeightSchema = z.object({
  exerciseId: uuid,
  kg: z.number().positive(MORE_THAN_ZERO).max(GYM_LIMITS.plateKg, AT_MOST_PLATE_KG).refine(twoDecimals, TWO_DECIMALS).nullable(),
});

// The day is optional here so that a missing one is refused with words of its own, not zod's "Required".
export const addSessionSchema = z.object({
  id: newId,
  date: isoDate,
  splitDayId: uuid.optional().nullable(),
  isDeload: z.boolean().default(false),
});

// The server counts the duration from the workout's own timer (D-039). The notes are saved on their own, as they change.
export const finishSessionSchema = z.object({ sessionId: uuid });

/**
 * A change of an open workout's notes (D-040): the notes the screen showed (`from`, null for none) and the new ones
 * (`to`). The server writes `to` only while the stored notes still equal `from`, so a change made on another device in
 * between is never lost.
 */
export const saveSessionNotesSchema = z
  .object({ sessionId: uuid, notes: z.object({ from: z.string().max(GYM_LIMITS.sessionNotes).nullable(), to: sessionNote }).strict() })
  .refine((v) => (v.notes.from ?? "") !== (v.notes.to ?? ""), "Nothing to save");

const weekSunday = isoDate.refine((d) => weekday(d) === 0, "A deload week starts on a Sunday");

/** The last and the next deload week, each the Sunday that starts the week (Sunday to Saturday). */
export const saveDeloadWeeksSchema = z
  .object({ last: weekSunday.nullable(), next: weekSunday.nullable() })
  .refine((v) => !v.last || !v.next || v.next > v.last, { message: DELOAD_ORDER, path: ["next"] });

/** Undo of saving the deload weeks: the weeks that save removed come back and the weeks it added go. */
export const restoreDeloadWeeksSchema = z.object({ add: z.array(weekSunday).max(60), remove: z.array(weekSunday).max(60) });

/** One workout by id: Pause, Resume and the Undo of Finish. */
export const sessionIdSchema = z.object({ sessionId: uuid });

/**
 * Cancel a workout. `onlyEmpty` (the Undo of "Started") cancels it only while it has no set, so that Undo never deletes a
 * set logged on another device; the Cancel workout button sends none.
 */
export const cancelSessionSchema = z.object({ sessionId: uuid, onlyEmpty: z.boolean().optional() });

/**
 * Undo of cancelling a workout, or of a Finish that deleted an empty one: the session as it was, with all its sets (same
 * ids and times) and its timer (the seconds counted, and whether it was running).
 */
export const restoreSessionSchema = z.object({
  id: uuid.optional(),
  createdAt: setFields.shape.createdAt,
  date: isoDate,
  splitDayId: uuid.optional().nullable(),
  isDeload: z.boolean(),
  notes: sessionNote,
  timerSeconds: z.number().int().min(0).max(1_000_000).default(0),
  timerRunning: z.boolean().default(false),
  // A set put back as it was stored, so the new-set rule of logSetSchema does not apply.
  sets: z.array(setFields.omit({ sessionId: true }).required({ setOrder: true })).max(300),
});

export const addCustomExerciseSchema = z.object({
  id: newId,
  name: z.string().trim().min(EXERCISE_NAME_MIN, NAME_TOO_SHORT).max(GYM_LIMITS.exerciseName).refine(visible, NAME_REQUIRED),
  muscleGroup: z.enum([...MUSCLE_GROUP_KEYS, "other"]),
  equipmentType: z.enum(["barbell", "dumbbell", "cable", "machine", "bodyweight"]),
});

/** Edit and Undo of a delete both name the exercise by id; Undo of a delete puts the same id back. */
export const customExerciseWithIdSchema = addCustomExerciseSchema.extend({ id: uuid });

export const saveSplitDaySchema = z.object({
  id: uuid,
  name: z.string().trim().min(1, NAME_REQUIRED).max(GYM_LIMITS.dayName).refine(visible, NAME_REQUIRED),
  isRest: z.boolean(),
  exercises: z
    .array(
      z
        .object({
          exerciseId: uuid,
          targetSets: z.number().int(ROUTINE_RANGE).min(1, ROUTINE_RANGE).max(GYM_LIMITS.targetSets, ROUTINE_RANGE),
          minReps: z.number().int(ROUTINE_RANGE).min(1, ROUTINE_RANGE).max(GYM_LIMITS.targetReps, ROUTINE_RANGE),
          maxReps: z.number().int(ROUTINE_RANGE).min(1, ROUTINE_RANGE).max(GYM_LIMITS.targetReps, ROUTINE_RANGE),
        })
        .refine((e) => e.minReps <= e.maxReps, MIN_OVER_MAX),
    )
    .max(20)
    .refine((list) => new Set(list.map((e) => e.exerciseId)).size === list.length, "Duplicate exercise"),
});

export type LogSetInput = z.infer<typeof logSetSchema>;
export type AddSessionInput = z.infer<typeof addSessionSchema>;
export type RestoreSessionInput = z.infer<typeof restoreSessionSchema>;
export type FinishSessionInput = z.infer<typeof finishSessionSchema>;
export type SaveSessionNotesInput = z.infer<typeof saveSessionNotesSchema>;
export type AddCustomExerciseInput = z.infer<typeof addCustomExerciseSchema>;
export type CustomExerciseWithIdInput = z.infer<typeof customExerciseWithIdSchema>;
export type SaveSplitDayInput = z.infer<typeof saveSplitDaySchema>;
export type RestoreDeloadWeeksInput = z.infer<typeof restoreDeloadWeeksSchema>;
export type SavePlateWeightInput = z.infer<typeof savePlateWeightSchema>;
