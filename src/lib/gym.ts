import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/server/db";
import {
  exercises,
  deloadWeeks,
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
  RestoreSessionInput,
  SaveSplitDayInput,
} from "./validations/gym";
import { DEFAULT_EXERCISES, ensureDefaultExercises, ensureUserDefaultSplit } from "./gym-seed";
import { addDays, toISODate } from "./format-date";
import { weekStart, weeksBetween } from "./gym-progress";

export interface DeloadStatus {
  /** x in "Week x of N": 1 to cycleLength, counted from the week after the last deload. */
  cycleWeek: number;
  /** N: normal training weeks between two deload weeks. */
  cycleLength: number;
  /** No next deload week chosen and the cycle is over: a deload is due. */
  isDeloadDue: boolean;
  /** This calendar week (Sunday to Saturday) is a deload week, chosen or logged. */
  inDeloadWeek: boolean;
  /** The latest deload week up to this one, as the Sunday that starts it. */
  lastDeloadWeek: string | null;
  /** The first deload week after this one, if the user chose one. */
  nextDeloadWeek: string | null;
}

/**
 * Fetch all available exercises for a user (preloaded global + user custom)
 */
export async function getExercises(userId: string) {
  const read = () =>
    db
      .select()
      .from(exercises)
      .where(or(isNull(exercises.userId), eq(exercises.userId, userId)))
      .orderBy(exercises.muscleGroup, exercises.name);
  const rows = await read();
  // The list already holds the shared defaults, so seeding (an extra round trip) only runs when one is missing.
  const have = new Set(rows.filter((r) => r.userId === null).map((r) => r.name));
  return DEFAULT_EXERCISES.every((d) => have.has(d.name)) ? rows : (await ensureDefaultExercises(), read());
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
 * Undo of creating a custom exercise. Refuses one a routine or a logged set already uses
 * (deleting it would cascade into them), and any exercise that is not the user's own custom one.
 */
export async function deleteCustomExercise(userId: string, exerciseId: string) {
  const own = and(eq(exercises.id, exerciseId), eq(exercises.userId, userId), eq(exercises.isCustom, true));
  const [inRoutine] = await db.select({ id: workoutSplitDayExercises.id }).from(workoutSplitDayExercises).where(eq(workoutSplitDayExercises.exerciseId, exerciseId)).limit(1);
  const [inSet] = await db.select({ id: workoutSets.id }).from(workoutSets).where(eq(workoutSets.exerciseId, exerciseId)).limit(1);
  if (inRoutine || inSet) return false;
  const deleted = await db.delete(exercises).where(own).returning({ id: exercises.id });
  return deleted.length > 0;
}

/**
 * Get the user's active split and its days with exercises
 */
export async function getUserSplitWithDays(userId: string) {
  const activeSplit = () =>
    db
      .select()
      .from(workoutSplits)
      .where(and(eq(workoutSplits.userId, userId), eq(workoutSplits.isActive, true)))
      .limit(1);

  // An active split means the user already has one, so the seeding check (a round trip) only runs without it.
  let splits = await activeSplit();
  if (splits.length === 0) {
    await ensureUserDefaultSplit(userId);
    splits = await activeSplit();
  }

  if (splits.length === 0) return null;
  const split = splits[0];

  const days = await db
    .select()
    .from(workoutSplitDays)
    .where(and(eq(workoutSplitDays.splitId, split.id), eq(workoutSplitDays.userId, userId)))
    .orderBy(workoutSplitDays.dayOfWeek);

  // One query for every day's exercises instead of one per day.
  const dayIds = days.map((d) => d.id);
  const allExercises = dayIds.length
    ? await db
        .select({
          id: workoutSplitDayExercises.id,
          splitDayId: workoutSplitDayExercises.splitDayId,
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
        .where(inArray(workoutSplitDayExercises.splitDayId, dayIds))
        .orderBy(workoutSplitDayExercises.orderIndex)
    : [];

  const daysWithExercises = days.map((day) => ({
    ...day,
    exercises: allExercises.filter((e) => e.splitDayId === day.id),
  }));

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
  if (input.splitDayId) {
    const [day] = await db
      .select({ id: workoutSplitDays.id })
      .from(workoutSplitDays)
      .where(and(eq(workoutSplitDays.id, input.splitDayId), eq(workoutSplitDays.userId, userId)));
    if (!day) throw new Error("Split day not found or unauthorized");
  }
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
      notes: input.notes ?? null,
    })
    .where(and(eq(workoutSessions.id, input.sessionId), eq(workoutSessions.userId, userId)))
    .returning();

  return updated;
}

/**
 * Open a finished workout again (Undo of Finish): the duration goes back to null. Owner only.
 */
export async function reopenWorkoutSession(userId: string, sessionId: string) {
  const [reopened] = await db
    .update(workoutSessions)
    .set({ durationMinutes: null, notes: null })
    .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
    .returning({ id: workoutSessions.id });
  return reopened;
}

/**
 * Put back a cancelled workout (Undo of Cancel) as an open one, with its sets under their own ids and times. Returns null when an
 * exercise is not visible to the user; a split day that is not theirs is dropped, not linked.
 */
export async function restoreWorkoutSession(userId: string, input: RestoreSessionInput) {
  const ids = [...new Set(input.sets.map((s) => s.exerciseId))];
  const sessionId = await db.transaction(async (tx) => {
    if (ids.length) {
      const visible = await tx
        .select({ id: exercises.id })
        .from(exercises)
        .where(and(inArray(exercises.id, ids), or(isNull(exercises.userId), eq(exercises.userId, userId))));
      if (visible.length !== ids.length) return null;
    }
    const [day] = input.splitDayId
      ? await tx
          .select({ id: workoutSplitDays.id })
          .from(workoutSplitDays)
          .where(and(eq(workoutSplitDays.id, input.splitDayId), eq(workoutSplitDays.userId, userId)))
      : [];
    const [session] = await tx
      .insert(workoutSessions)
      .values({ ...(input.id && { id: input.id }), ...(input.createdAt && { createdAt: input.createdAt }), userId, date: input.date, splitDayId: day?.id ?? null, isDeload: input.isDeload, notes: input.notes ?? null })
      .onConflictDoNothing()
      .returning({ id: workoutSessions.id });
    if (!session) return null;
    if (input.sets.length) {
      await tx.insert(workoutSets).values(
        input.sets.map((s) => ({
          ...s,
          sessionId: session.id,
          userId,
          loadValue: s.loadValue.toFixed(2),
          extraKg: s.extraKg.toFixed(2),
          anomalyReason: s.anomalyReason ?? null,
          notes: s.notes ?? null,
        })),
      );
    }
    return session.id;
  });
  return sessionId ? getWorkoutSessionDetails(userId, sessionId) : null;
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
  // The session and exercise checks are independent, so they share one round trip.
  const [session, [exercise]] = await Promise.all([
    db
      .select({ id: workoutSessions.id })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.id, input.sessionId), eq(workoutSessions.userId, userId)))
      .limit(1),
    db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.id, input.exerciseId), or(isNull(exercises.userId), eq(exercises.userId, userId)))),
  ]);
  if (session.length === 0) throw new Error("Workout session not found or unauthorized");
  if (!exercise) throw new Error("Exercise not found or unauthorized");

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
      ...(input.id && { id: input.id }),
      ...(input.createdAt && { createdAt: input.createdAt }),
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
      isGoodForm: input.isGoodForm,
      flagAnomaly,
      anomalyReason: anomalyReason ?? null,
      notes: input.notes ?? null,
    })
    .onConflictDoNothing() // an Undo id that is taken (by anyone) writes nothing
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
      isGoodForm: workoutSets.isGoodForm,
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

/** Every deload week (the Sunday that starts it): the weeks the user chose. A single deload session does not make its week one. */
async function deloadWeekSet(userId: string): Promise<Set<string>> {
  const marked = await db.select({ week: deloadWeeks.weekStart }).from(deloadWeeks).where(eq(deloadWeeks.userId, userId));
  return new Set(marked.map((m) => m.week));
}

const DEFAULT_CYCLE = 5;
const MAX_CYCLE = 9; // the Edit dialog offers 10 weeks, so a gap beyond that is not a cycle

/**
 * Deload cycle in calendar weeks (Sunday to Saturday, the same weeks the Progress tab skips). A deload week is one the
 * user chose. Week 1 is the week after the last deload (or the first workout's week);
 * the length N is the gap between the last deload and the chosen next one, else the gap between the last two deloads,
 * else 5. With no next deload chosen, a deload is due once week N is over.
 */
export async function getDeloadStatus(userId: string): Promise<DeloadStatus> {
  const all = [...(await deloadWeekSet(userId))].sort();
  const today = toISODate();
  const thisWeek = weekStart(today);
  const past = all.filter((w) => w <= thisWeek);
  const last = past.at(-1) ?? null;
  const next = all.find((w) => w > thisWeek) ?? null;
  const inDeloadWeek = last === thisWeek;

  let from = last;
  if (!from) {
    const [first] = await db
      .select({ date: workoutSessions.date })
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, userId))
      .orderBy(workoutSessions.date)
      .limit(1);
    from = addDays(weekStart(first?.date ?? today), -7); // the week before the first workout, so that week is week 1
  }

  const gapBefore = past.length > 1 ? weeksBetween(past.at(-2)!, past.at(-1)!) - 1 : 0;
  const cycleLength = next && last ? weeksBetween(last, next) - 1 : gapBefore >= 1 && gapBefore <= MAX_CYCLE ? gapBefore : DEFAULT_CYCLE;
  const week = next ? cycleLength + 1 - weeksBetween(thisWeek, next) : weeksBetween(from, today);

  return {
    cycleWeek: Math.min(Math.max(week, 1), cycleLength),
    cycleLength,
    isDeloadDue: !inDeloadWeek && !next && week > cycleLength,
    inDeloadWeek,
    lastDeloadWeek: last,
    nextDeloadWeek: next,
  };
}

/**
 * Sets the last and the next deload week (Sundays). Both become deload weeks and their workouts are marked deload;
 * every other deload week after `last` is dropped and its workouts cleared, so the Progress chart and History follow
 * the plan. Weeks before `last` are history and stay. Undo is this call with the previous pair.
 */
export async function saveDeloadWeeks(userId: string, { last, next }: { last: string | null; next: string | null }) {
  const keep = [...new Set([last, next].filter((w): w is string => !!w))];
  const removed = [...(await deloadWeekSet(userId))].filter((w) => !keep.includes(w) && (!last || w > last));
  const inWeek = (w: string) => and(eq(workoutSessions.userId, userId), gte(workoutSessions.date, w), lt(workoutSessions.date, addDays(w, 7)));
  await db.transaction(async (tx) => {
    if (removed.length) {
      await tx.delete(deloadWeeks).where(and(eq(deloadWeeks.userId, userId), inArray(deloadWeeks.weekStart, removed)));
      for (const w of removed) await tx.update(workoutSessions).set({ isDeload: false }).where(inWeek(w));
    }
    for (const w of keep) {
      await tx.insert(deloadWeeks).values({ userId, weekStart: w }).onConflictDoNothing();
      await tx.update(workoutSessions).set({ isDeload: true }).where(inWeek(w));
    }
  });
  return { last, next };
}

export interface HistorySession {
  id: string;
  date: string;
  dayId: string | null;
  dayName: string | null;
  durationMinutes: number | null;
  isDeload: boolean;
  exercises: { id: string; name: string; sets: { reps: number; loadType: string; load: number }[] }[];
}

/**
 * Every past workout with sets, newest first, for the Workout tab's History. Rest days are never sessions, so they
 * do not show. A workout still open (no duration, started since `openSince`) is not past yet. Only workouts
 * dated `since` or later, so the query stays bounded however long the history grows.
 */
export async function getWorkoutHistory(userId: string, openSince: string, since: string): Promise<HistorySession[]> {
  const rows = await db
    .select({
      id: workoutSessions.id,
      date: workoutSessions.date,
      dayId: workoutSessions.splitDayId,
      dayName: workoutSplitDays.name,
      durationMinutes: workoutSessions.durationMinutes,
      isDeload: workoutSessions.isDeload,
      exerciseId: workoutSets.exerciseId,
      exerciseName: exercises.name,
      reps: workoutSets.reps,
      loadType: workoutSets.loadType,
      loadValue: workoutSets.loadValue,
      extraKg: workoutSets.extraKg,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
    .innerJoin(exercises, eq(workoutSets.exerciseId, exercises.id))
    .leftJoin(workoutSplitDays, eq(workoutSessions.splitDayId, workoutSplitDays.id))
    .where(
      and(
        eq(workoutSets.userId, userId),
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.date, since),
        or(isNotNull(workoutSessions.durationMinutes), lt(workoutSessions.date, openSince)),
      ),
    )
    .orderBy(desc(workoutSessions.date), desc(workoutSessions.createdAt), workoutSessions.id, workoutSets.createdAt);
  const sessions = new Map<string, HistorySession>();
  for (const r of rows) {
    const s =
      sessions.get(r.id) ??
      { id: r.id, date: r.date, dayId: r.dayId, dayName: r.dayName, durationMinutes: r.durationMinutes, isDeload: r.isDeload, exercises: [] };
    sessions.set(r.id, s);
    let ex = s.exercises.find((e) => e.id === r.exerciseId);
    if (!ex) s.exercises.push((ex = { id: r.exerciseId, name: r.exerciseName, sets: [] }));
    ex.sets.push({ reps: r.reps, loadType: r.loadType, load: Number(r.loadValue) + Number(r.extraKg) });
  }
  return [...sessions.values()];
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
