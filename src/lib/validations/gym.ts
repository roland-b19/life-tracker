import { z } from "zod";
import { isoDate, newId, uuid, visible } from "./common";
import { MUSCLE_GROUP_KEYS } from "@/lib/gym-muscles";

/**
 * The limits of a logged set, the sets of one exercise in a workout, a set's and a workout's note, an exercise's name
 * and a day's name (the varchar(255), varchar(500), varchar(120) and varchar(100) columns), shared by the forms and the
 * server.
 */
export const GYM_LIMITS = { reps: 200, load: 1000, extra: 300, sets: 50, setNotes: 255, sessionNotes: 500, exerciseName: 120, dayName: 100 } as const;

/** What a weight below zero answers, in the set form and on the server. */
export const NOT_NEGATIVE = "Can't be negative";
/** What a weight with more than two decimals answers (the columns keep two), in the set form and on the server. */
export const TWO_DECIMALS = "Maximum two decimal places.";
/** What deleting a set that is no longer there answers: the client then has nothing to put back. */
export const SET_GONE = "Set not found.";
/** Whether a number has at most two decimals. */
export const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
/** A set's weight: at least 0, at most `max`, with at most two decimals. */
const weight = (max: number) => z.number().min(0, NOT_NEGATIVE).max(max).refine(twoDecimals, TWO_DECIMALS);

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

export const logSetSchema = z.object({
  // The device makes the id (D-040); Undo also sends the time and the set's number, to bring a deleted set back as it
  // was. The server checks the time falls within the workout, and numbers a new set itself (D-040: a log sends only what
  // the device knows, so two devices never pick one number).
  id: newId,
  createdAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + SET_TIME_SKEW_MS, "Date cannot be in the future").optional(),
  sessionId: uuid,
  exerciseId: uuid,
  setOrder: z.number().int().min(1).max(GYM_LIMITS.sets).optional(),
  reps: z.number().int().min(1).max(GYM_LIMITS.reps),
  loadType: z.enum(["kg", "plates", "bodyweight"]),
  loadValue: weight(GYM_LIMITS.load),
  extraKg: weight(GYM_LIMITS.extra).default(0),
  isFailure: z.boolean().default(true),
  isPartial: z.boolean().default(false),
  isGoodForm: z.boolean().default(true),
  flagAnomaly: z.boolean().default(false),
  anomalyReason: z.enum(["too_heavy", "pain", "form", "other"]).optional().nullable(),
  notes: note(GYM_LIMITS.setNotes),
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
  .object({ sessionId: uuid, notes: z.object({ from: z.string().max(GYM_LIMITS.sessionNotes).nullable(), to: note(GYM_LIMITS.sessionNotes) }).strict() })
  .refine((v) => (v.notes.from ?? "") !== (v.notes.to ?? ""), "Nothing to save.");

const weekSunday = isoDate.refine((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0, "A deload week starts on a Sunday");

/** The last and the next deload week, each the Sunday that starts the week (Sunday to Saturday). */
export const saveDeloadWeeksSchema = z
  .object({ last: weekSunday.nullable(), next: weekSunday.nullable() })
  .refine((v) => !v.last || !v.next || v.next > v.last, { message: "The next deload must come after the last one", path: ["next"] });

/** Undo of saving the deload weeks: the weeks that save removed come back and the weeks it added go. */
export const restoreDeloadWeeksSchema = z.object({ add: z.array(weekSunday).max(60), remove: z.array(weekSunday).max(60) });

/** One workout by id: Cancel, Pause, Resume and the Undo of Finish. */
export const sessionIdSchema = z.object({ sessionId: uuid });

/**
 * Undo of cancelling a workout, or of a Finish that deleted an empty one: the session as it was, with all its sets (same
 * ids and times) and its timer (the seconds counted, and whether it was running).
 */
export const restoreSessionSchema = z.object({
  id: uuid.optional(),
  createdAt: logSetSchema.shape.createdAt,
  date: isoDate,
  splitDayId: uuid.optional().nullable(),
  isDeload: z.boolean(),
  notes: note(GYM_LIMITS.sessionNotes),
  timerSeconds: z.number().int().min(0).max(1_000_000).default(0),
  timerRunning: z.boolean().default(false),
  sets: z.array(logSetSchema.omit({ sessionId: true }).required({ setOrder: true })).max(300),
});

export const addCustomExerciseSchema = z.object({
  id: newId,
  name: z.string().trim().min(2).max(GYM_LIMITS.exerciseName).refine(visible, "Name is required"),
  muscleGroup: z.enum([...MUSCLE_GROUP_KEYS, "other"]),
  equipmentType: z.enum(["barbell", "dumbbell", "cable", "machine", "bodyweight"]),
});

/** Edit and Undo of a delete both name the exercise by id; Undo of a delete puts the same id back. */
export const customExerciseWithIdSchema = addCustomExerciseSchema.extend({ id: uuid });

export const saveSplitDaySchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(GYM_LIMITS.dayName).refine(visible, "Name is required"),
  isRest: z.boolean(),
  exercises: z
    .array(
      z
        .object({
          exerciseId: uuid,
          targetSets: z.number().int().min(1).max(10),
          minReps: z.number().int().min(1).max(100),
          maxReps: z.number().int().min(1).max(100),
        })
        .refine((e) => e.minReps <= e.maxReps, "Min reps must not exceed max reps"),
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
