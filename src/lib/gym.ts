import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  exercises,
  workoutSplits,
  workoutSplitDays,
  workoutSplitDayExercises,
  workoutSessions,
  workoutSets,
} from "@/db/schema";
import {
  CreateCustomExerciseInput,
  CreateSessionInput,
  FinishSessionInput,
  LogSetInput,
  SaveSplitDayInput,
} from "./validations/gym";
import { ensureDefaultExercises, ensureUserDefaultSplit } from "./gym-seed";

export interface ExerciseContext {
  previousSets: Array<{
    reps: number;
    loadType: string;
    loadValue: string;
    extraKg: string;
    isFailure: boolean;
    isPartial: boolean;
    notes?: string | null;
  }>;
  pr?: {
    loadType: string;
    loadValue: string;
    extraKg: string;
    reps: number;
    date: string;
  } | null;
  lastNote?: string | null;
  suggestIncrease: boolean;
}

export interface DeloadStatus {
  weeksSinceLastDeload: number;
  currentCycleWeek: number; // 1 to 5
  isDeloadDue: boolean;
  lastDeloadDate: string | null;
}

/**
 * Fetch all available exercises for a user (preloaded global + user custom)
 */
export async function getExercises(userId: string) {
  await ensureDefaultExercises();
  return db
    .select()
    .from(exercises)
    .where(or(isNull(exercises.userId), eq(exercises.userId, userId)))
    .orderBy(exercises.muscleGroup, exercises.name);
}

/**
 * Create a custom user exercise
 */
export async function createCustomExercise(
  userId: string,
  input: CreateCustomExerciseInput,
) {
  const [created] = await db
    .insert(exercises)
    .values({
      userId,
      name: input.name,
      muscleGroup: input.muscleGroup,
      equipmentType: input.equipmentType,
      isCustom: true,
    })
    .returning();
  return created;
}

/**
 * Get the user's active split and its days with exercises
 */
export async function getUserSplitWithDays(userId: string) {
  await ensureUserDefaultSplit(userId);

  const splits = await db
    .select()
    .from(workoutSplits)
    .where(and(eq(workoutSplits.userId, userId), eq(workoutSplits.isActive, true)))
    .limit(1);

  if (splits.length === 0) return null;
  const split = splits[0];

  const days = await db
    .select()
    .from(workoutSplitDays)
    .where(and(eq(workoutSplitDays.splitId, split.id), eq(workoutSplitDays.userId, userId)))
    .orderBy(workoutSplitDays.dayOfWeek);

  const daysWithExercises = await Promise.all(
    days.map(async (day) => {
      const dayExercises = await db
        .select({
          id: workoutSplitDayExercises.id,
          exerciseId: exercises.id,
          exerciseName: exercises.name,
          muscleGroup: exercises.muscleGroup,
          equipmentType: exercises.equipmentType,
          targetSets: workoutSplitDayExercises.targetSets,
          minReps: workoutSplitDayExercises.minReps,
          maxReps: workoutSplitDayExercises.maxReps,
          orderIndex: workoutSplitDayExercises.orderIndex,
        })
        .from(workoutSplitDayExercises)
        .innerJoin(exercises, eq(workoutSplitDayExercises.exerciseId, exercises.id))
        .where(eq(workoutSplitDayExercises.splitDayId, day.id))
        .orderBy(workoutSplitDayExercises.orderIndex);

      return {
        ...day,
        exercises: dayExercises,
      };
    }),
  );

  return {
    ...split,
    days: daysWithExercises,
  };
}

/**
 * Replace one day of the user's routine (name, rest flag, ordered exercises).
 * Returns false when the day is not the user's or an exercise is not visible to the user.
 */
export async function saveSplitDay(userId: string, input: SaveSplitDayInput): Promise<boolean> {
  const list = input.isRest ? [] : input.exercises;
  return db.transaction(async (tx) => {
    const [day] = await tx
      .select({ id: workoutSplitDays.id })
      .from(workoutSplitDays)
      .where(and(eq(workoutSplitDays.id, input.id), eq(workoutSplitDays.userId, userId)));
    if (!day) return false;

    if (list.length) {
      const visible = await tx
        .select({ id: exercises.id })
        .from(exercises)
        .where(
          and(
            inArray(exercises.id, list.map((e) => e.exerciseId)),
            or(isNull(exercises.userId), eq(exercises.userId, userId)),
          ),
        );
      if (visible.length !== list.length) return false;
    }

    await tx
      .update(workoutSplitDays)
      .set({ name: input.name, isRest: input.isRest })
      .where(eq(workoutSplitDays.id, day.id));
    await tx.delete(workoutSplitDayExercises).where(eq(workoutSplitDayExercises.splitDayId, day.id));
    if (list.length) {
      await tx.insert(workoutSplitDayExercises).values(
        list.map((e, i) => ({ splitDayId: day.id, orderIndex: i, ...e })),
      );
    }
    return true;
  });
}

/**
 * Create a new workout session
 */
export async function createWorkoutSession(
  userId: string,
  input: CreateSessionInput,
) {
  const [session] = await db
    .insert(workoutSessions)
    .values({
      userId,
      date: input.date,
      splitDayId: input.splitDayId ?? null,
      isDeload: input.isDeload,
      notes: input.notes ?? null,
    })
    .returning();

  return session;
}

/**
 * Finish a workout session
 */
export async function finishWorkoutSession(
  userId: string,
  input: FinishSessionInput,
) {
  const [updated] = await db
    .update(workoutSessions)
    .set({
      durationMinutes: input.durationMinutes ?? null,
      notes: input.notes ?? undefined,
    })
    .where(and(eq(workoutSessions.id, input.sessionId), eq(workoutSessions.userId, userId)))
    .returning();

  return updated;
}

/**
 * Delete a workout the user started but does not want (its sets go with it). Owner only.
 */
export async function cancelWorkoutSession(userId: string, sessionId: string) {
  const [deleted] = await db
    .delete(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .returning({ id: workoutSessions.id });
  return deleted;
}

/**
 * The workout the user left without finishing: the newest session with no duration since `since` (a date).
 * shortcut: "unfinished" is a null duration, so the Finish button insists on one; older rows saved without
 * one would read as open, which `since` hides after a couple of days. Upgrade: a finished_at column.
 */
export async function getOpenWorkoutSession(userId: string, since: string) {
  const [open] = await db
    .select({ id: workoutSessions.id, splitDayName: workoutSplitDays.name })
    .from(workoutSessions)
    .leftJoin(workoutSplitDays, eq(workoutSessions.splitDayId, workoutSplitDays.id))
    .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.durationMinutes), gte(workoutSessions.date, since)))
    .orderBy(desc(workoutSessions.date), desc(workoutSessions.createdAt))
    .limit(1);
  if (!open) return null;
  const details = await getWorkoutSessionDetails(userId, open.id);
  return details && { ...details, splitDayName: open.splitDayName };
}

/**
 * Log a workout set with automatic '!!' anomaly detection
 */
export async function logWorkoutSet(userId: string, input: LogSetInput) {
  // Verify session belongs to user
  const session = await db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, input.sessionId), eq(workoutSessions.userId, userId)))
    .limit(1);

  if (session.length === 0) {
    throw new Error("Workout session not found or unauthorized");
  }

  // Automatic anomaly check: if reps < target min reps
  let flagAnomaly = input.flagAnomaly;
  let anomalyReason = input.anomalyReason;

  if (input.minTargetReps && input.reps < input.minTargetReps) {
    flagAnomaly = true;
    if (!anomalyReason) {
      anomalyReason = "too_heavy";
    }
  }

  const [createdSet] = await db
    .insert(workoutSets)
    .values({
      sessionId: input.sessionId,
      userId,
      exerciseId: input.exerciseId,
      setOrder: input.setOrder,
      reps: input.reps,
      loadType: input.loadType,
      loadValue: input.loadValue.toFixed(2),
      extraKg: input.extraKg ? input.extraKg.toFixed(2) : "0.00",
      isFailure: input.isFailure,
      isPartial: input.isPartial,
      flagAnomaly,
      anomalyReason: anomalyReason ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return createdSet;
}

/**
 * Delete a workout set
 */
export async function deleteWorkoutSet(userId: string, setId: string) {
  const [deleted] = await db
    .delete(workoutSets)
    .where(and(eq(workoutSets.id, setId), eq(workoutSets.userId, userId)))
    .returning();
  return deleted;
}

/**
 * Fetch a session with all its sets and exercise info
 */
export async function getWorkoutSessionDetails(userId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .limit(1);

  if (!session) return null;

  const sets = await db
    .select({
      id: workoutSets.id,
      sessionId: workoutSets.sessionId,
      exerciseId: workoutSets.exerciseId,
      exerciseName: exercises.name,
      equipmentType: exercises.equipmentType,
      muscleGroup: exercises.muscleGroup,
      setOrder: workoutSets.setOrder,
      reps: workoutSets.reps,
      loadType: workoutSets.loadType,
      loadValue: workoutSets.loadValue,
      extraKg: workoutSets.extraKg,
      isFailure: workoutSets.isFailure,
      isPartial: workoutSets.isPartial,
      flagAnomaly: workoutSets.flagAnomaly,
      anomalyReason: workoutSets.anomalyReason,
      notes: workoutSets.notes,
      createdAt: workoutSets.createdAt,
    })
    .from(workoutSets)
    .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
    .where(and(eq(workoutSets.sessionId, sessionId), eq(workoutSets.userId, userId)))
    .orderBy(workoutSets.exerciseId, workoutSets.setOrder);

  return {
    session,
    sets,
  };
}

/**
 * Get in-workout context for an exercise (last session sets, PR, note, progressive overload hint)
 */
export async function getExerciseContext(
  userId: string,
  exerciseId: string,
  currentSessionId?: string,
  maxTargetReps?: number,
): Promise<ExerciseContext> {
  // Find previous sessions containing this exercise
  let sessionDateLimit: string | undefined;
  if (currentSessionId) {
    const [curr] = await db
      .select({ date: workoutSessions.date })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.id, currentSessionId), eq(workoutSessions.userId, userId)))
      .limit(1);
    if (curr) sessionDateLimit = curr.date;
  }

  // Find the most recent previous session with sets for this exercise
  const previousSessionsQuery = db
    .select({
      sessionId: workoutSessions.id,
      date: workoutSessions.date,
    })
    .from(workoutSessions)
    .innerJoin(workoutSets, eq(workoutSets.sessionId, workoutSessions.id))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSets.exerciseId, exerciseId),
        sessionDateLimit
          ? lt(workoutSessions.date, sessionDateLimit)
          : undefined,
        currentSessionId
          ? sql`${workoutSessions.id} != ${currentSessionId}`
          : undefined,
      ),
    )
    .orderBy(desc(workoutSessions.date))
    .limit(1);

  const prevSessionRes = await previousSessionsQuery;
  let previousSets: ExerciseContext["previousSets"] = [];
  let lastNote: string | null = null;
  let suggestIncrease = false;

  if (prevSessionRes.length > 0) {
    const prevSessionId = prevSessionRes[0].sessionId;
    const sets = await db
      .select({
        reps: workoutSets.reps,
        loadType: workoutSets.loadType,
        loadValue: workoutSets.loadValue,
        extraKg: workoutSets.extraKg,
        isFailure: workoutSets.isFailure,
        isPartial: workoutSets.isPartial,
        notes: workoutSets.notes,
      })
      .from(workoutSets)
      .where(
        and(
          eq(workoutSets.sessionId, prevSessionId),
          eq(workoutSets.userId, userId),
          eq(workoutSets.exerciseId, exerciseId),
        ),
      )
      .orderBy(workoutSets.setOrder);

    previousSets = sets;
    for (const s of sets) {
      if (s.notes) {
        lastNote = s.notes;
      }
    }

    // Progressive overload: if maxTargetReps is defined and any set hit or exceeded it without anomaly
    if (maxTargetReps && sets.length > 0) {
      const hitTop = sets.some((s) => s.reps >= maxTargetReps);
      if (hitTop) {
        suggestIncrease = true;
      }
    }
  }

  // Find Personal Record (PR) for this exercise
  const allSets = await db
    .select({
      loadType: workoutSets.loadType,
      loadValue: workoutSets.loadValue,
      extraKg: workoutSets.extraKg,
      reps: workoutSets.reps,
      date: workoutSessions.date,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .where(
      and(
        eq(workoutSets.userId, userId),
        eq(workoutSets.exerciseId, exerciseId),
        eq(workoutSessions.isDeload, false), // Exclude deload from PRs
      ),
    )
    .orderBy(desc(sql`CAST(${workoutSets.loadValue} AS numeric)`), desc(workoutSets.reps))
    .limit(1);

  const pr = allSets.length > 0 ? allSets[0] : null;

  return {
    previousSets,
    pr,
    lastNote,
    suggestIncrease,
  };
}

/**
 * 5-Week Deload Tracker
 */
export async function getDeloadStatus(userId: string): Promise<DeloadStatus> {
  const lastDeload = await db
    .select({ date: workoutSessions.date })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.isDeload, true)))
    .orderBy(desc(workoutSessions.date))
    .limit(1);

  let referenceDate: Date;
  let lastDeloadDate: string | null = null;

  if (lastDeload.length > 0) {
    lastDeloadDate = lastDeload[0].date;
    referenceDate = new Date(lastDeloadDate);
  } else {
    // If no deload yet, find first workout session
    const firstSession = await db
      .select({ date: workoutSessions.date })
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, userId))
      .orderBy(workoutSessions.date)
      .limit(1);

    if (firstSession.length > 0) {
      referenceDate = new Date(firstSession[0].date);
    } else {
      referenceDate = new Date(); // New user: week 1
    }
  }

  const now = new Date();
  const diffDays = Math.max(0, Math.floor((now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)));
  const weeksPassed = Math.floor(diffDays / 7);

  const currentCycleWeek = (weeksPassed % 5) + 1; // 1, 2, 3, 4, 5
  const isDeloadDue = currentCycleWeek === 5 || weeksPassed >= 5;

  return {
    weeksSinceLastDeload: weeksPassed,
    currentCycleWeek,
    isDeloadDue,
    lastDeloadDate,
  };
}

export interface HistorySet {
  date: string;
  sessionId: string;
  isDeload: boolean;
  dayId: string | null;
  dayName: string | null;
  exerciseId: string;
  exerciseName: string;
  setOrder: number;
  reps: number;
  loadType: string;
  /** loadValue plus the extra kg, as one number. */
  load: number;
}

/**
 * Every set the user logged since `since` (a date), oldest first: what the progress charts and the logged-days
 * calendar are drawn from. Capped, so a huge history cannot make the page slow.
 */
export async function getGymHistory(userId: string, since: string): Promise<HistorySet[]> {
  const rows = await db
    .select({
      date: workoutSessions.date,
      sessionId: workoutSessions.id,
      isDeload: workoutSessions.isDeload,
      dayId: workoutSessions.splitDayId,
      dayName: workoutSplitDays.name,
      exerciseId: workoutSets.exerciseId,
      exerciseName: exercises.name,
      setOrder: workoutSets.setOrder,
      reps: workoutSets.reps,
      loadType: workoutSets.loadType,
      loadValue: workoutSets.loadValue,
      extraKg: workoutSets.extraKg,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
    .leftJoin(workoutSplitDays, eq(workoutSessions.splitDayId, workoutSplitDays.id))
    .where(and(eq(workoutSets.userId, userId), eq(workoutSessions.userId, userId), gte(workoutSessions.date, since)))
    .orderBy(workoutSessions.date, workoutSessions.createdAt, workoutSets.setOrder)
    .limit(8000);
  return rows.map(({ loadValue, extraKg, ...r }) => ({ ...r, load: Number(loadValue) + Number(extraKg) }));
}
