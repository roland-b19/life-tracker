import { showDecimal } from "@/lib/decimal-input";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface LibraryExercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipmentType: string;
}

/** Edit-form row: numbers stay strings so a cleared field is not silently 0. */
export interface DraftExercise {
  exerciseId: string;
  targetSets: string;
  minReps: string;
  maxReps: string;
}

export interface DayDraft {
  id: string;
  dayOfWeek: number;
  name: string;
  isRest: boolean;
  exercises: DraftExercise[];
}

export interface ExerciseItem {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  equipmentType: string;
  targetSets: number;
  minReps: number;
  maxReps: number;
  orderIndex: number;
}

export interface SplitDay {
  id: string;
  dayOfWeek: number;
  name: string;
  isRest: boolean;
  orderIndex: number;
  exercises: ExerciseItem[];
}

export interface DeloadInfo {
  cycleWeek: number;
  cycleLength: number;
  isDeloadDue: boolean;
  inDeloadWeek: boolean;
  lastDeloadWeek: string | null;
  nextDeloadWeek: string | null;
}

export interface WorkoutSetData {
  id: string;
  exerciseId: string;
  setOrder: number;
  reps: number;
  loadType: string;
  loadValue: string;
  extraKg: string;
  isFailure: boolean;
  isPartial: boolean;
  isGoodForm: boolean;
  flagAnomaly: boolean;
  anomalyReason?: string | null;
  notes?: string | null;
  createdAt?: Date | string;
}

export interface ActiveSessionData {
  id: string;
  createdAt?: Date | string;
  date: string;
  isDeload: boolean;
  splitDayId?: string | null;
  splitDayName?: string;
  sets: WorkoutSetData[];
}

/** "8 × 52.5 kg": one logged set as the user reads it (the extra kg is already in `load`). */
export function setText(x: { reps: number; loadType: string; load: number }) {
  const n = Math.round(x.load * 100) / 100;
  const l = showDecimal(String(n));
  const w =
    x.loadType === "bodyweight" ? (n > 0 ? `BW + ${l} kg` : "BW") : `${l} ${x.loadType === "plates" ? "plates" : "kg"}`;
  return `${x.reps} × ${w}`;
}
