import { z } from "zod";

export const logSetSchema = z.object({
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
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  splitDayId: z.string().uuid().optional().nullable(),
  isDeload: z.boolean().default(false),
  notes: z.string().max(500).optional().nullable(),
});

export const finishSessionSchema = z.object({
  sessionId: z.string().uuid(),
  durationMinutes: z.number().int().min(1).max(600).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const createCustomExerciseSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  muscleGroup: z.enum([
    "chest",
    "back",
    "legs",
    "shoulders",
    "arms",
    "calves",
    "abs",
    "other",
  ]),
  equipmentType: z.enum(["barbell", "dumbbell", "cable", "machine", "bodyweight"]),
});

export type LogSetInput = z.infer<typeof logSetSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type FinishSessionInput = z.infer<typeof finishSessionSchema>;
export type CreateCustomExerciseInput = z.infer<typeof createCustomExerciseSchema>;
