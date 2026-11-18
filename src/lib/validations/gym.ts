import { z } from "zod";
import { isoDate, uuid, visible } from "./common";
import { MUSCLE_GROUP_KEYS } from "@/lib/gym-muscles";

/** The limits of a logged set and a note, shared by the form and the server. */
export const GYM_LIMITS = { reps: 200, load: 1000, extra: 300, notes: 500 } as const;

export const logSetSchema = z.object({
  // Only Undo sends these, to bring a deleted set back as it was (same id, same time).
  id: uuid.optional(),
  createdAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 60_000, "Date cannot be in the future").optional(),
  sessionId: uuid,
  exerciseId: uuid,
  setOrder: z.number().int().min(1).max(50),
  reps: z.number().int().min(1).max(GYM_LIMITS.reps),
  loadType: z.enum(["kg", "plates", "bodyweight"]),
  loadValue: z.number().min(0).max(GYM_LIMITS.load),
  extraKg: z.number().min(0).max(GYM_LIMITS.extra).default(0),
  isFailure: z.boolean().default(true),
  isPartial: z.boolean().default(false),
  isGoodForm: z.boolean().default(true),
  flagAnomaly: z.boolean().default(false),
  anomalyReason: z.enum(["too_heavy", "pain", "form", "other"]).optional().nullable(),
  notes: z.string().max(GYM_LIMITS.notes).optional().nullable(),
});

export const createSessionSchema = z.object({
  date: isoDate,
  splitDayId: uuid.optional().nullable(),
  isDeload: z.boolean().default(false),
  notes: z.string().max(GYM_LIMITS.notes).optional().nullable(),
});

// The duration is required: a workout without one would read as still open.
export const finishSessionSchema = z.object({
  sessionId: uuid,
  durationMinutes: z.number().int().min(1).max(600),
  notes: z.string().max(GYM_LIMITS.notes).optional().nullable(),
});

const weekSunday = isoDate.refine((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0, "A deload week starts on a Sunday");

/** The last and the next deload week, each the Sunday that starts the week (Sunday to Saturday). */
export const saveDeloadWeeksSchema = z
  .object({ last: weekSunday.nullable(), next: weekSunday.nullable() })
  .refine((v) => !v.last || !v.next || v.next > v.last, { message: "The next deload must come after the last one", path: ["next"] });

export const cancelSessionSchema = z.object({ sessionId: uuid });

/** Undo of cancelling a workout: the session as it was, with all its sets (same ids and times). */
export const restoreSessionSchema = z.object({
  id: uuid.optional(),
  createdAt: logSetSchema.shape.createdAt,
  date: isoDate,
  splitDayId: uuid.optional().nullable(),
  isDeload: z.boolean(),
  notes: z.string().max(GYM_LIMITS.notes).optional().nullable(),
  sets: z.array(logSetSchema.omit({ sessionId: true })).max(300),
});

export const createCustomExerciseSchema = z.object({
  name: z.string().trim().min(2).max(120).refine(visible, "Name is required"),
  muscleGroup: z.enum([...MUSCLE_GROUP_KEYS, "other"]),
  equipmentType: z.enum(["barbell", "dumbbell", "cable", "machine", "bodyweight"]),
});

/** Edit and Undo of a delete both name the exercise by id; Undo of a delete puts the same id back. */
export const customExerciseWithIdSchema = createCustomExerciseSchema.extend({ id: uuid });

export const saveSplitDaySchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(100).refine(visible, "Name is required"),
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
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type RestoreSessionInput = z.infer<typeof restoreSessionSchema>;
export type FinishSessionInput = z.infer<typeof finishSessionSchema>;
export type CreateCustomExerciseInput = z.infer<typeof createCustomExerciseSchema>;
export type CustomExerciseWithIdInput = z.infer<typeof customExerciseWithIdSchema>;
export type SaveSplitDayInput = z.infer<typeof saveSplitDaySchema>;
