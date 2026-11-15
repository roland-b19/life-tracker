import { eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  exercises,
  workoutSplits,
  workoutSplitDays,
  workoutSplitDayExercises,
} from "@/db/schema";

export const DEFAULT_EXERCISES = [
  // Chest
  { name: "Incline barbell press", muscleGroup: "chest", equipmentType: "barbell" },
  { name: "Flat barbell bench press", muscleGroup: "chest", equipmentType: "barbell" },
  { name: "Cable fly (push down)", muscleGroup: "chest", equipmentType: "cable" },
  { name: "Dumbbell bench press", muscleGroup: "chest", equipmentType: "dumbbell" },
  // Back
  { name: "Weighted pull-ups", muscleGroup: "back", equipmentType: "bodyweight" },
  { name: "Chest-supported row", muscleGroup: "back", equipmentType: "machine" },
  { name: "Lat pulldown", muscleGroup: "back", equipmentType: "cable" },
  { name: "Barbell deadlift", muscleGroup: "back", equipmentType: "barbell" },
  // Legs
  { name: "Seated/lying hamstring curl", muscleGroup: "hamstrings", equipmentType: "machine" },
  { name: "Barbell squat / Leg press", muscleGroup: "quads", equipmentType: "barbell" },
  { name: "RDL (Romanian Deadlift)", muscleGroup: "hamstrings", equipmentType: "barbell" },
  { name: "Leg extension", muscleGroup: "quads", equipmentType: "machine" },
  { name: "Abductors (outside)", muscleGroup: "glutes", equipmentType: "machine" },
  { name: "Adductors (inside)", muscleGroup: "adductors", equipmentType: "machine" },
  { name: "Hip thrust", muscleGroup: "glutes", equipmentType: "barbell" },
  { name: "Standing calf raise", muscleGroup: "calves", equipmentType: "machine" },
  // Shoulders
  { name: "Lateral raise (high)", muscleGroup: "shoulders", equipmentType: "cable" },
  { name: "Dumbbell lateral raise", muscleGroup: "shoulders", equipmentType: "dumbbell" },
  { name: "Overhead press", muscleGroup: "shoulders", equipmentType: "barbell" },
  // Arms
  { name: "Cable overhead extension (high)", muscleGroup: "triceps", equipmentType: "cable" },
  { name: "Cable pushdown (low)", muscleGroup: "triceps", equipmentType: "cable" },
  { name: "Bayesian curl (high)", muscleGroup: "biceps", equipmentType: "cable" },
  { name: "Incline curl", muscleGroup: "biceps", equipmentType: "dumbbell" },
  { name: "Dumbbell curl", muscleGroup: "biceps", equipmentType: "dumbbell" },
  // Abs
  { name: "Cable crunch", muscleGroup: "abs", equipmentType: "cable" },
  { name: "Hanging leg raise", muscleGroup: "abs", equipmentType: "bodyweight" },
] as const;

let seeding: Promise<Map<string, string>> | null = null;

/** Concurrent callers (the page loads the split and the exercise list together) share one seeding run, so a first visit never inserts the defaults twice. */
export function ensureDefaultExercises(): Promise<Map<string, string>> {
  return (seeding ??= seedDefaultExercises().finally(() => {
    seeding = null;
  }));
}

async function seedDefaultExercises(): Promise<Map<string, string>> {
  const defaults = () => db.select({ id: exercises.id, name: exercises.name }).from(exercises).where(isNull(exercises.userId));
  const nameToId = new Map((await defaults()).map((row) => [row.name, row.id]));

  const toInsert = DEFAULT_EXERCISES.filter((ex) => !nameToId.has(ex.name));
  if (toInsert.length > 0) {
    await db
      .insert(exercises)
      .values(toInsert.map((ex) => ({ name: ex.name, muscleGroup: ex.muscleGroup, equipmentType: ex.equipmentType, isCustom: false, userId: null })))
      .onConflictDoNothing(); // a seed running at the same moment may have inserted them
    for (const row of await defaults()) nameToId.set(row.name, row.id);
  }

  return nameToId;
}

/** Serialises one kind of write per user until the transaction ends (Postgres advisory lock, no migration needed). */
export const lockUser = (tx: Pick<typeof db, "execute">, scope: string, userId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${scope}:${userId}`}))`);

export async function ensureUserDefaultSplit(userId: string): Promise<string> {
  const existingSplits = await db
    .select({ id: workoutSplits.id })
    .from(workoutSplits)
    .where(eq(workoutSplits.userId, userId))
    .limit(1);

  if (existingSplits.length > 0) {
    return existingSplits[0].id;
  }

  const exerciseMap = await ensureDefaultExercises();
  // One transaction under a per-user lock: a half-built split never shows, and two first visits at once build one.
  return db.transaction(async (tx) => {
    await lockUser(tx, "split", userId);
    const [again] = await tx.select({ id: workoutSplits.id }).from(workoutSplits).where(eq(workoutSplits.userId, userId)).limit(1);
    if (again) return again.id;

    // Create the default Upper / Lower 5-Day split
    const [split] = await tx
      .insert(workoutSplits)
      .values({
        userId,
        name: "Upper / Lower 5-Day",
        isActive: true,
      })
      .returning({ id: workoutSplits.id });

    // 7 days specification
    const daysSpec = [
      {
        dayOfWeek: 0,
        name: "Upper (chest)",
        isRest: false,
        exercises: [
          { name: "Incline barbell press", targetSets: 2, minReps: 5, maxReps: 8 },
          { name: "Cable fly (push down)", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Weighted pull-ups", targetSets: 2, minReps: 5, maxReps: 8 },
          { name: "Lateral raise (high)", targetSets: 2, minReps: 8, maxReps: 12 },
          { name: "Chest-supported row", targetSets: 2, minReps: 5, maxReps: 8 },
          { name: "Cable overhead extension (high)", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Bayesian curl (high)", targetSets: 2, minReps: 5, maxReps: 8 },
        ],
      },
      {
        dayOfWeek: 1,
        name: "Legs (hamstrings)",
        isRest: false,
        exercises: [
          { name: "Seated/lying hamstring curl", targetSets: 2, minReps: 5, maxReps: 8 },
          { name: "Barbell squat / Leg press", targetSets: 2, minReps: 5, maxReps: 8 },
          { name: "RDL (Romanian Deadlift)", targetSets: 2, minReps: 5, maxReps: 8 },
          { name: "Leg extension", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Abductors (outside)", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Standing calf raise", targetSets: 2, minReps: 8, maxReps: 10 },
        ],
      },
      {
        dayOfWeek: 2,
        name: "Rest",
        isRest: true,
        exercises: [],
      },
      {
        dayOfWeek: 3,
        name: "Upper (back)",
        isRest: false,
        exercises: [
          { name: "Incline barbell press", targetSets: 2, minReps: 5, maxReps: 8 },
          { name: "Cable fly (push down)", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Weighted pull-ups", targetSets: 2, minReps: 5, maxReps: 8 },
          { name: "Lateral raise (high)", targetSets: 2, minReps: 8, maxReps: 12 },
          { name: "Chest-supported row", targetSets: 2, minReps: 5, maxReps: 8 },
          { name: "Cable overhead extension (high)", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Bayesian curl (high)", targetSets: 2, minReps: 8, maxReps: 10 },
        ],
      },
      {
        dayOfWeek: 4,
        name: "Legs (quads)",
        isRest: false,
        exercises: [
          { name: "Seated/lying hamstring curl", targetSets: 2, minReps: 5, maxReps: 8 },
          { name: "Barbell squat / Leg press", targetSets: 2, minReps: 5, maxReps: 8 },
          { name: "Hip thrust", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Leg extension", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Adductors (inside)", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Standing calf raise", targetSets: 2, minReps: 8, maxReps: 10 },
        ],
      },
      {
        dayOfWeek: 5,
        name: "Arms",
        isRest: false,
        exercises: [
          { name: "Incline curl", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Dumbbell curl", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Cable pushdown (low)", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Cable overhead extension (high)", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Overhead press", targetSets: 2, minReps: 8, maxReps: 10 },
          { name: "Lateral raise (high)", targetSets: 2, minReps: 8, maxReps: 12 },
        ],
      },
      {
        dayOfWeek: 6,
        name: "Rest",
        isRest: true,
        exercises: [],
      },
    ];

    for (let i = 0; i < daysSpec.length; i++) {
      const day = daysSpec[i];
      const [splitDay] = await tx
        .insert(workoutSplitDays)
        .values({
          splitId: split.id,
          userId,
          dayOfWeek: day.dayOfWeek,
          name: day.name,
          isRest: day.isRest,
          orderIndex: i,
        })
        .returning({ id: workoutSplitDays.id });

      for (let j = 0; j < day.exercises.length; j++) {
        const ex = day.exercises[j];
        const exId = exerciseMap.get(ex.name);
        if (exId) {
          await tx.insert(workoutSplitDayExercises).values({
            splitDayId: splitDay.id,
            exerciseId: exId,
            orderIndex: j,
            targetSets: ex.targetSets,
            minReps: ex.minReps,
            maxReps: ex.maxReps,
          });
        }
      }
    }


    return split.id;
  });
}
