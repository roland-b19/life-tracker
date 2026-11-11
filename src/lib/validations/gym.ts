import { z } from "zod";
import { isoDate } from "./common";
import { MUSCLE_GROUP_KEYS } from "../gym-muscles";

export const logSetSchema = z.object({
  // Only Undo sends these, to bring a deleted set back as it was (same id, same time).
  id: z.string().uuid().optional(),
  createdAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 60_000, "Date cannot be in the future").optional(),
  sessionId: z.string().uuid(),
  exerciseId: z.string().uuid(),
  setOrder: z.number().int().min(1).max(50),
  reps: z.number().int().min(1).max(200),
  loadType: z.enum(["kg", "plates", "bodyweight"]),
  loadValue: z.number().min(0).max(1000),
  extraKg: z.number().min(0).max(300).default(0),
  isFailure: z.boolean().default(true),
  isPartial: z.boolean().default(false),
  flagAnomaly: z.boolean().default(false),
  anomalyReason: z.enum(["too_heavy", "pain", "form", "other"]).optional().nullable(),
  notes: z.string().max(255).optional().nullable(),
  minTargetReps: z.number().int().min(1).optional(),
  maxTargetReps: z.number().int().min(1).optional(),
});

export const createSessionSchema = z.object({
  date: isoDate,
  splitDayId: z.string().uuid().optional().nullable(),
  isDeload: z.boolean().default(false),
  notes: z.string().max(500).optional().nullable(),
});

export const finishSessionSchema = z.object({
  sessionId: z.string().uuid(),
  durationMinutes: z.number().int().min(1).max(600).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const cancelSessionSchema = z.object({ sessionId: z.string().uuid() });

/** Undo of cancelling a workout: the session as it was, with all its sets (same ids and times). */
export const restoreSessionSchema = z.object({
  id: z.string().uuid().optional(),
  createdAt: logSetSchema.shape.createdAt,
  date: isoDate,
  splitDayId: z.string().uuid().optional().nullable(),
  isDeload: z.boolean(),
  notes: z.string().max(500).optional().nullable(),
  sets: z.array(logSetSchema.omit({ sessionId: true, minTargetReps: true, maxTargetReps: true })).max(300),
});

export const createCustomExerciseSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  muscleGroup: z.enum([...MUSCLE_GROUP_KEYS, "other"]),
  equipmentType: z.enum(["barbell", "dumbbell", "cable", "machine", "bodyweight"]),
});

export const saveSplitDaySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  isRest: z.boolean(),
  exercises: z
    .array(
      z
        .object({
          exerciseId: z.string().uuid(),
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
export type SaveSplitDayInput = z.infer<typeof saveSplitDaySchema>;
