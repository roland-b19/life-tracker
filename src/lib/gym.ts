import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql, type SQLWrapper } from "drizzle-orm";
import { db } from "@/server/db";
import {
  exercises,
  exercisePlateWeights,
  deloadWeeks,
  workoutSplits,
  workoutSplitDays,
  workoutSplitDayExercises,
  workoutSessions,
  workoutSets,
} from "@/db/schema";
import {
  AddCustomExerciseInput,
  CustomExerciseWithIdInput,
  AddSessionInput,
  FinishSessionInput,
  GYM_LIMITS,
  LogSetInput,
  NAME_SPACES,
  NOTES_CHANGED,
  RestoreDeloadWeeksInput,
  RestoreSessionInput,
  SaveSessionNotesInput,
  SavePlateWeightInput,
  SaveSplitDayInput,
  SET_TIME_SKEW_MS,
  SETS_LOGGED,
  WORKOUT_FINISHED,
  WORKOUT_GONE,
} from "./validations/gym";
import { alreadyExists, Refusal } from "./validations/result";
import { setLoad } from "./gym-progress";
import { DEFAULT_EXERCISES, ensureDefaultExercises, ensureUserDefaultSplit, lockUser } from "./gym-seed";
import { addDays, toISODate, weekStart } from "./format-date";
import { weeksBetween } from "./gym-progress";

interface DeloadStatus {
  /** x in "Week x of N": 1 to cycleLength, counted from the week after the last deload. */
  cycleWeek: number;
  /** N: normal training weeks between two deload weeks. */
  cycleLength: number;
  /** No next deload week chosen and the cycle is over: a deload is due. */
  isDeloadDue: boolean;
  /** This calendar week (Sunday to Saturday) is a deload week the user chose in the setting. */
  inDeloadWeek: boolean;
  /** The latest deload week up to this one, as the Sunday that starts it. */
  lastDeloadWeek: string | null;
  /** The first deload week after this one, if the user chose one. */
  nextDeloadWeek: string | null;
  /**
   * Every deload week the user chose, oldest first. The progress figures leave each of them out whole, and also the
   * week of any workout started as a deload (`deloadWeeksIn`, D-038).
   */
  weeks: string[];
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
 * Create a custom user exercise. With the id the device made (D-040) an add sent twice is one row: the repeat answers
 * the row the first one made. An id that is already another user's row creates nothing and answers null.
 */
export async function addCustomExercise(
  userId: string,
  input: AddCustomExerciseInput,
) {
  return db.transaction(async (tx) => {
    await lockUser(tx, "exercise", userId);
    if (input.id) {
      const [made] = await tx.select().from(exercises).where(and(eq(exercises.id, input.id), eq(exercises.userId, userId), eq(exercises.isCustom, true)));
      if (made) return made;
    }
    await refuseTakenName(tx, userId, input.name);
    const [created] = await tx
      .insert(exercises)
      .values({ id: input.id, userId, name: input.name, muscleGroup: input.muscleGroup, equipmentType: input.equipmentType, isCustom: true })
      .onConflictDoNothing()
      .returning();
    return created ?? null;
  });
}

/** An exercise name as `exerciseNameKey` compares it, in SQL with the same space list: inner spaces collapsed, case and a trailing "." ignored. */
const nameKey = (name: SQLWrapper) =>
  sql`lower(regexp_replace(regexp_replace(regexp_replace(${name}, ${NAME_SPACES}::text, ' ', 'g'), '^ | $', '', 'g'), ' ?\\.$', ''))`;

/**
 * One name per user across the defaults and their own, compared by `nameKey`, so the picker never lists two of the same
 * name; `except` is the exercise being edited. The refusal names the exercise that has it.
 */
async function refuseTakenName(tx: Pick<typeof db, "select">, userId: string, name: string, except?: string) {
  const [same] = await tx
    .select({ name: exercises.name })
    .from(exercises)
    .where(and(sql`${nameKey(exercises.name)} = ${nameKey(sql`${name}::text`)}`, or(isNull(exercises.userId), eq(exercises.userId, userId)), except ? ne(exercises.id, except) : undefined))
    .limit(1);
  if (same) throw new Refusal(alreadyExists(same.name));
}

/** Edit of the user's own custom exercise (also the Undo of an edit); null when it is not (or no longer) theirs. */
export async function updateCustomExercise(userId: string, input: CustomExerciseWithIdInput) {
  return db.transaction(async (tx) => {
    await lockUser(tx, "exercise", userId);
    const own = and(eq(exercises.id, input.id), eq(exercises.userId, userId), eq(exercises.isCustom, true));
    // A gone exercise says so before any name clash does.
    const [mine] = await tx.select({ id: exercises.id }).from(exercises).where(own);
    if (!mine) return null;
    await refuseTakenName(tx, userId, input.name, input.id);
    const [row] = await tx
      .update(exercises)
      .set({ name: input.name, muscleGroup: input.muscleGroup, equipmentType: input.equipmentType })
      .where(own)
      .returning();
    return row;
  });
}

/** Undo of deleting a custom exercise: the same row comes back under its old id (a repeated Undo is a no-op). */
export async function restoreCustomExercise(userId: string, input: CustomExerciseWithIdInput) {
  return db.transaction(async (tx) => {
    await lockUser(tx, "exercise", userId);
    await refuseTakenName(tx, userId, input.name, input.id);
    await tx.insert(exercises).values({ ...input, userId, isCustom: true }).onConflictDoNothing();
    const [row] = await tx.select().from(exercises).where(and(eq(exercises.id, input.id), eq(exercises.userId, userId), eq(exercises.isCustom, true)));
    return row ?? null;
  });
}

/**
 * Delete of a custom exercise (also the Undo of creating one). "in-use" when a routine or a logged set already uses it
 * (deleting it would cascade into them), "missing" when it is not (or no longer) the user's own custom exercise. It
 * holds the same per-user lock as `saveSplitDay`, so a day saved at the same moment either keeps the exercise (and the
 * delete is refused) or is refused itself, never left half-saved.
 */
export async function deleteCustomExercise(userId: string, exerciseId: string): Promise<"deleted" | "in-use" | "missing"> {
  return db.transaction(async (tx) => {
    await lockUser(tx, "exercise", userId);
    const own = and(eq(exercises.id, exerciseId), eq(exercises.userId, userId), eq(exercises.isCustom, true));
    const [mine] = await tx.select({ id: exercises.id }).from(exercises).where(own);
    if (!mine) return "missing";
    const [inRoutine] = await tx.select({ id: workoutSplitDayExercises.id }).from(workoutSplitDayExercises).where(eq(workoutSplitDayExercises.exerciseId, exerciseId)).limit(1);
    const [inSet] = await tx.select({ id: workoutSets.id }).from(workoutSets).where(eq(workoutSets.exerciseId, exerciseId)).limit(1);
    if (inRoutine || inSet) return "in-use";
    await tx.delete(exercises).where(own);
    return "deleted";
  });
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
 * Returns false when the day is not the user's; refuses, changing nothing, when an exercise on it is not visible to the
 * user (deleted in another tab, say). It holds the lock `deleteCustomExercise` takes, so the two never interleave.
 */
export async function saveSplitDay(userId: string, input: SaveSplitDayInput): Promise<boolean> {
  const list = input.isRest ? [] : input.exercises;
  return db.transaction(async (tx) => {
    await lockUser(tx, "exercise", userId);
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
      if (visible.length !== list.length) throw new Refusal("An exercise on this day no longer exists. Remove it and save again.");
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

/** What a custom exercise that is gone (deleted in another tab, say) answers. */
export const EXERCISE_GONE = "This exercise no longer exists.";

/** One open workout (no duration) per user, as the database index says: a second one is refused here with a message, not left to a constraint error. */
async function refuseIfOpen(tx: Pick<typeof db, "select">, userId: string, exceptId?: string) {
  const [open] = await tx
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.durationMinutes), exceptId ? ne(workoutSessions.id, exceptId) : undefined))
    .limit(1);
  if (open) throw new Refusal("A workout is already open. Resume or finish it first.");
}

/**
 * A workout's timer at `now` (D-039): the seconds counted before the last pause plus the running stretch since
 * `timerRunningSince`. "Now" is the server's clock, so every device shows the same time.
 */
function workoutTimer(row: { timerSeconds: number; timerRunningSince: Date | null }, now = new Date()) {
  const since = row.timerRunningSince;
  const stretch = since ? Math.max(0, Math.floor((now.getTime() - since.getTime()) / 1000)) : 0;
  return { seconds: row.timerSeconds + stretch, running: since !== null };
}

/** The saved duration: whole minutes of the timer, at least 1, at most 600. */
const workoutMinutes = (seconds: number) => Math.min(600, Math.max(1, Math.round(seconds / 60)));

/** How Start found the day: a new workout, today's open one (running, or paused and now running) or today's finished one, reopened. */
type StartedFrom = "new" | "running" | "paused" | "finished";

/**
 * Start a workout (D-039): one per day, on a training day of the user's own routine. Start on the day of today's workout
 * reopens it and its timer runs again; Start on another day while today has a workout is refused, naming that workout's
 * day, and so is another workout still open (an earlier day's). With the id the device made (D-040) a Start sent twice
 * is one row; an id that is another user's creates nothing and answers null. Answers the workout with its day's name.
 */
export async function addWorkoutSession(userId: string, input: AddSessionInput) {
  if (!input.splitDayId) throw new Refusal("Pick a training day to start a workout.");
  const dayId = input.splitDayId;
  const started = await db.transaction(async (tx) => {
    await lockUser(tx, "session", userId); // two Start taps (or two tabs) at once must not both pass the checks below
    const [day] = await tx
      .select({ id: workoutSplitDays.id, name: workoutSplitDays.name, isRest: workoutSplitDays.isRest })
      .from(workoutSplitDays)
      .where(and(eq(workoutSplitDays.id, dayId), eq(workoutSplitDays.userId, userId)));
    if (!day) throw new Refusal("This day is no longer in your routine.");
    if (day.isRest) throw new Refusal("A rest day has no workout. Pick a training day.");
    const answer = (session: typeof workoutSessions.$inferSelect, from: StartedFrom) => ({ session, from, splitDayName: day.name });
    const now = new Date();
    // Days from before this rule may hold two workouts: the open one first, else the latest.
    const [same] = await tx
      .select()
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), or(eq(workoutSessions.date, input.date), input.id ? eq(workoutSessions.id, input.id) : undefined)))
      .orderBy(sql`${workoutSessions.durationMinutes} is null desc`, desc(workoutSessions.createdAt))
      .limit(1);
    // One workout per date: Start on another day must not switch today's workout to it, nor show it as that day.
    if (same && same.splitDayId !== day.id) {
      const [other] = same.splitDayId
        ? await tx.select({ name: workoutSplitDays.name }).from(workoutSplitDays).where(eq(workoutSplitDays.id, same.splitDayId))
        : [];
      throw new Refusal(other ? `Today already has a workout: "${other.name}". Pick that day to keep going.` : "Today already has a workout.");
    }
    const reopen = async (set: Partial<typeof workoutSessions.$inferInsert>) =>
      (await tx.update(workoutSessions).set(set).where(eq(workoutSessions.id, same.id)).returning())[0];
    if (same && same.durationMinutes === null) {
      if (same.timerRunningSince) return answer(same, "running");
      return answer(await reopen({ timerRunningSince: now }), "paused");
    }
    await refuseIfOpen(tx, userId);
    if (same) return answer(await reopen({ durationMinutes: null, timerRunningSince: now }), "finished");
    const [made] = await tx
      .insert(workoutSessions)
      .values({ id: input.id, userId, date: input.date, splitDayId: day.id, isDeload: input.isDeload, timerSeconds: 0, timerRunningSince: now })
      .onConflictDoNothing()
      .returning();
    return made ? answer(made, "new") : null;
  });
  if (!started) return null;
  const details = await getWorkoutSessionDetails(userId, started.session.id);
  return details && { ...details, from: started.from, splitDayName: started.splitDayName };
}

/**
 * Pause (`run` false) or resume (`run` true) a workout's timer; null when the workout is not the user's. A repeat (a
 * second device, a double tap) changes nothing and answers the timer as it is.
 */
export async function setWorkoutTimer(userId: string, sessionId: string, run: boolean) {
  return db.transaction(async (tx) => {
    await lockUser(tx, "session", userId);
    const [row] = await tx.select().from(workoutSessions).where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)));
    if (!row) return null;
    if (row.durationMinutes !== null) throw new Refusal(WORKOUT_FINISHED);
    const now = new Date();
    if (run === (row.timerRunningSince !== null)) return workoutTimer(row, now);
    const [next] = await tx
      .update(workoutSessions)
      .set(run ? { timerRunningSince: now } : { timerSeconds: workoutTimer(row, now).seconds, timerRunningSince: null })
      .where(eq(workoutSessions.id, row.id))
      .returning();
    return workoutTimer(next, now);
  });
}

/**
 * Finish a workout: the server counts the duration from its timer and keeps the day it was started on (one finished
 * after midnight stays on its day). A workout with no sets is deleted instead (D-039), answered with `deleted` and the
 * row as it was, so Undo can put it back. A second Finish is refused; null when the workout is not the user's.
 */
export async function finishWorkoutSession(userId: string, input: FinishSessionInput) {
  return db.transaction(async (tx) => {
    await lockUser(tx, "session", userId); // a set logged at the same moment lands before the Finish or is refused
    const mine = and(eq(workoutSessions.id, input.sessionId), eq(workoutSessions.userId, userId));
    const [row] = await tx.select().from(workoutSessions).where(mine);
    if (!row) return null;
    if (row.durationMinutes !== null) throw new Refusal(WORKOUT_FINISHED);
    const timer = workoutTimer(row);
    const [set] = await tx.select({ id: workoutSets.id }).from(workoutSets).where(eq(workoutSets.sessionId, row.id)).limit(1);
    if (!set) {
      await tx.delete(workoutSessions).where(mine);
      return { session: row, timer, deleted: true };
    }
    const [session] = await tx
      .update(workoutSessions)
      .set({ durationMinutes: workoutMinutes(timer.seconds), timerSeconds: timer.seconds, timerRunningSince: null })
      .where(mine)
      .returning();
    return { session, timer: workoutTimer(session), deleted: false };
  });
}

/**
 * Save an open workout's notes (D-040): `to` is written only while the stored notes still equal `from`. A finished
 * workout's are history (D-039); null when the workout is not the user's. Answers the notes as saved (trimmed, or null).
 */
export async function saveWorkoutNotes(userId: string, input: SaveSessionNotesInput) {
  return db.transaction(async (tx) => {
    await lockUser(tx, "session", userId); // a Finish at the same moment lands before the save or after it, never between
    const mine = and(eq(workoutSessions.id, input.sessionId), eq(workoutSessions.userId, userId));
    const [row] = await tx.select({ notes: workoutSessions.notes, durationMinutes: workoutSessions.durationMinutes }).from(workoutSessions).where(mine);
    if (!row) return null;
    if (row.durationMinutes !== null) throw new Refusal(WORKOUT_FINISHED);
    if ((row.notes ?? "") !== (input.notes.from ?? "")) throw new Refusal(NOTES_CHANGED);
    const [saved] = await tx.update(workoutSessions).set({ notes: input.notes.to ?? null }).where(mine).returning({ notes: workoutSessions.notes });
    return saved;
  });
}

/**
 * Open a finished workout again (Undo of Finish): the duration goes back to null, its notes stay and its timer runs on
 * from the time it had. Answers its timer; owner only (null otherwise); a workout already open answers as it is.
 */
export async function reopenWorkoutSession(userId: string, sessionId: string) {
  return db.transaction(async (tx) => {
    await lockUser(tx, "session", userId);
    const [row] = await tx.select().from(workoutSessions).where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)));
    if (!row) return null;
    if (row.durationMinutes === null) return { timer: workoutTimer(row) };
    await refuseIfOpen(tx, userId, sessionId); // Undo of Finish after starting another workout would break the one-open rule
    const [open] = await tx
      .update(workoutSessions)
      .set({ durationMinutes: null, timerRunningSince: new Date() })
      .where(eq(workoutSessions.id, row.id))
      .returning();
    return { timer: workoutTimer(open) };
  });
}

/** Whether a set's time falls within its workout: from its start to now, give or take `SET_TIME_SKEW_MS`. */
const withinWorkout = (at: Date, start: Date, now = Date.now()) =>
  at.getTime() >= start.getTime() - SET_TIME_SKEW_MS && at.getTime() <= now + SET_TIME_SKEW_MS;

/**
 * Put back a cancelled workout (Undo of Cancel), or one a Finish deleted because it had no sets, as an open one with its
 * sets under their own ids and times and its timer as it was. Returns null when an exercise is not visible to the user,
 * a set's time is outside the workout or the day already has another workout (D-039); a split day that is not theirs is
 * dropped, not linked.
 */
export async function restoreWorkoutSession(userId: string, input: RestoreSessionInput) {
  const ids = [...new Set(input.sets.map((s) => s.exerciseId))];
  const sessionId = await db.transaction(async (tx) => {
    await lockUser(tx, "exercise", userId); // the order `logWorkoutSet` takes them in: exercise, then session
    await lockUser(tx, "session", userId);
    await refuseIfOpen(tx, userId);
    const [sameDay] = await tx
      .select({ id: workoutSessions.id })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.date, input.date)))
      .limit(1);
    if (sameDay) return null;
    if (ids.length) {
      const visible = await tx
        .select({ id: exercises.id })
        .from(exercises)
        .where(and(inArray(exercises.id, ids), or(isNull(exercises.userId), eq(exercises.userId, userId))));
      if (visible.length !== ids.length) return null;
    }
    const start = input.createdAt ?? new Date();
    if (input.sets.some((s) => s.createdAt && !withinWorkout(s.createdAt, start))) return null;
    const [day] = input.splitDayId
      ? await tx
          .select({ id: workoutSplitDays.id })
          .from(workoutSplitDays)
          .where(and(eq(workoutSplitDays.id, input.splitDayId), eq(workoutSplitDays.userId, userId)))
      : [];
    // A set id that is taken would fail the whole insert with a database error: refuse it as a normal "could not restore".
    const setIds = input.sets.flatMap((s) => (s.id ? [s.id] : []));
    if (setIds.length) {
      const [taken] = await tx.select({ id: workoutSets.id }).from(workoutSets).where(inArray(workoutSets.id, setIds)).limit(1);
      if (taken) return null;
    }
    const [session] = await tx
      .insert(workoutSessions)
      .values({
        ...(input.id && { id: input.id }),
        createdAt: start,
        userId,
        date: input.date,
        splitDayId: day?.id ?? null,
        isDeload: input.isDeload,
        notes: input.notes ?? null,
        timerSeconds: input.timerSeconds,
        timerRunningSince: input.timerRunning ? new Date() : null,
      })
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
 * Delete an open workout the user started but does not want (its sets go with it). Owner only (undefined otherwise); a
 * finished workout is history (D-039) and is refused, also from a page that still shows it open. With `onlyEmpty` (the
 * Undo of "Started") a workout with a set is refused too, whichever device logged it. Answers its timer at that moment,
 * which Undo puts back.
 */
export async function cancelWorkoutSession(userId: string, sessionId: string, onlyEmpty = false) {
  return db.transaction(async (tx) => {
    // A Finish or a set at the same moment lands before the Cancel (and is seen here) or after it (and is refused).
    await lockUser(tx, "session", userId);
    const mine = and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId));
    const [row] = await tx.select({ durationMinutes: workoutSessions.durationMinutes }).from(workoutSessions).where(mine);
    if (!row) return undefined;
    if (row.durationMinutes !== null) throw new Refusal(WORKOUT_FINISHED);
    if (onlyEmpty) {
      const [set] = await tx.select({ id: workoutSets.id }).from(workoutSets).where(eq(workoutSets.sessionId, sessionId)).limit(1);
      if (set) throw new Refusal(SETS_LOGGED);
    }
    const [deleted] = await tx.delete(workoutSessions).where(mine).returning();
    return { id: deleted.id, timer: workoutTimer(deleted) };
  });
}

/**
 * The workout the user left without finishing: the one session with no duration (the database allows one per user).
 * shortcut: "unfinished" is a null duration, so a Finish always stores one. Upgrade: a finished_at column.
 */
export async function getOpenWorkoutSession(userId: string) {
  const [open] = await db
    .select({ id: workoutSessions.id, splitDayName: workoutSplitDays.name })
    .from(workoutSessions)
    .leftJoin(workoutSplitDays, eq(workoutSessions.splitDayId, workoutSplitDays.id))
    .where(and(eq(workoutSessions.userId, userId), isNull(workoutSessions.durationMinutes)))
    .limit(1);
  if (!open) return null;
  const details = await getWorkoutSessionDetails(userId, open.id);
  return details && { ...details, splitDayName: open.splitDayName };
}

/**
 * Log a workout set with automatic '!!' anomaly detection. Only into the user's own open workout (D-039), at a time
 * within it, with an exercise the user can see. With the id the device made (D-040) a set sent twice is one row: the
 * repeat answers the row the first one made; an id that is another user's row creates nothing and answers null.
 * A bodyweight set is saved with no extra kg: the set form has none (D-031).
 */
export async function logWorkoutSet(userId: string, input: LogSetInput) {
  return db.transaction(async (tx) => {
    // The lock `deleteCustomExercise` takes: a custom exercise deleted at the same moment either stays (this set uses
    // it) or is gone before the check below. Then the lock Finish takes: a set never lands in a workout finished meanwhile.
    await lockUser(tx, "exercise", userId);
    await lockUser(tx, "session", userId);
    if (input.id) {
      const [made] = await tx.select().from(workoutSets).where(and(eq(workoutSets.id, input.id), eq(workoutSets.userId, userId)));
      if (made) return made;
    }
    const [session] = await tx
      // The day's target for this exercise comes from the database, never from the request: a client cannot switch the flag off.
      .select({ id: workoutSessions.id, createdAt: workoutSessions.createdAt, durationMinutes: workoutSessions.durationMinutes, minReps: workoutSplitDayExercises.minReps })
      .from(workoutSessions)
      .leftJoin(
        workoutSplitDayExercises,
        and(eq(workoutSplitDayExercises.splitDayId, workoutSessions.splitDayId), eq(workoutSplitDayExercises.exerciseId, input.exerciseId)),
      )
      .where(and(eq(workoutSessions.id, input.sessionId), eq(workoutSessions.userId, userId)))
      .limit(1);
    if (!session) throw new Refusal(WORKOUT_GONE);
    if (session.durationMinutes !== null) throw new Refusal(WORKOUT_FINISHED);
    const [exercise] = await tx
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.id, input.exerciseId), or(isNull(exercises.userId), eq(exercises.userId, userId))));
    if (!exercise) throw new Refusal(EXERCISE_GONE);
    if (input.createdAt && !withinWorkout(input.createdAt, session.createdAt)) throw new Refusal("A set's time must fall within its workout.");

    // Automatic anomaly check: if reps < target min reps
    const below = session.minReps !== null && input.reps < session.minReps;
    const flagAnomaly = input.flagAnomaly || below;
    const anomalyReason = input.anomalyReason ?? (below ? "too_heavy" : null);
    const extraKg = input.loadType === "bodyweight" ? 0 : input.extraKg;
    // A new set takes the next number of its exercise in this workout. Undo of a delete brings its own back, unless a set
    // logged meanwhile took it: then it takes the next one too, so no two sets of an exercise share a number.
    const taken = await tx
      .select({ setOrder: workoutSets.setOrder })
      .from(workoutSets)
      .where(and(eq(workoutSets.sessionId, input.sessionId), eq(workoutSets.exerciseId, input.exerciseId)));
    let setOrder = input.setOrder;
    if (setOrder === undefined || taken.some((s) => s.setOrder === setOrder)) {
      setOrder = Math.max(0, ...taken.map((s) => s.setOrder)) + 1;
      if (setOrder > GYM_LIMITS.sets) throw new Refusal(`At most ${GYM_LIMITS.sets} sets of one exercise in a workout.`);
    }

    const [createdSet] = await tx
      .insert(workoutSets)
      .values({
        ...(input.id && { id: input.id }),
        ...(input.createdAt && { createdAt: input.createdAt }),
        sessionId: input.sessionId,
        userId,
        exerciseId: input.exerciseId,
        setOrder,
        reps: input.reps,
        loadType: input.loadType,
        loadValue: input.loadValue.toFixed(2),
        extraKg: extraKg.toFixed(2),
        isFailure: input.isFailure,
        isPartial: input.isPartial,
        isGoodForm: input.isGoodForm,
        flagAnomaly,
        anomalyReason,
        notes: input.notes ?? null,
      })
      .onConflictDoNothing() // an id that is another user's row writes nothing
      .returning();
    return createdSet ?? null;
  });
}

/**
 * Delete a set of the user's open workout. A finished workout's sets are history (D-039) and are refused; undefined when
 * the set is not the user's (or already gone).
 */
export async function deleteWorkoutSet(userId: string, setId: string) {
  return db.transaction(async (tx) => {
    await lockUser(tx, "session", userId); // a Finish at the same moment lands before the delete (refused) or after it
    const [found] = await tx
      .select({ durationMinutes: workoutSessions.durationMinutes })
      .from(workoutSets)
      .innerJoin(workoutSessions, eq(workoutSets.sessionId, workoutSessions.id))
      .where(and(eq(workoutSets.id, setId), eq(workoutSets.userId, userId)));
    if (!found) return undefined;
    if (found.durationMinutes !== null) throw new Refusal(WORKOUT_FINISHED);
    const [deleted] = await tx.delete(workoutSets).where(and(eq(workoutSets.id, setId), eq(workoutSets.userId, userId))).returning();
    return deleted;
  });
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

  return { session, sets, timer: workoutTimer(session) };
}

/**
 * The deload weeks the user chose in the setting (the Sunday that starts each): the cycle counts only these. The
 * progress figures also leave out the week of any deload session (`deloadWeeksIn`).
 */
async function deloadWeekSet(userId: string): Promise<Set<string>> {
  const marked = await db.select({ week: deloadWeeks.weekStart }).from(deloadWeeks).where(eq(deloadWeeks.userId, userId));
  return new Set(marked.map((m) => m.week));
}

const DEFAULT_CYCLE = 5;
const MAX_CYCLE = 9; // the Edit dialog offers 10 weeks, so a gap beyond that is not a cycle

/**
 * Deload cycle in calendar weeks (Sunday to Saturday). A deload week here is one the user chose; the progress figures
 * leave out those weeks whole plus the week of any deload session (`deloadWeeksIn`). Week 1 is the week after the
 * last deload (or the first workout's week);
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
    weeks: all,
  };
}

/**
 * Sets the last and the next deload week (Sundays). Both become deload weeks, and every other one from this week on is
 * dropped (the plan). Weeks before this week are history and stay, so "Not set" or an earlier Last never deletes one:
 * the card's Last is then still the latest of them, answered as `last`. Only the plan changes: a workout is a deload
 * workout when it was started as one (decision 2026-11-16), so choosing a week never rewrites workouts already logged.
 * Answers the weeks it added and removed, which Undo (`restoreDeloadWeeks`) swaps back exactly.
 */
export async function saveDeloadWeeks(userId: string, { last, next }: { last: string | null; next: string | null }) {
  const thisWeek = weekStart(toISODate());
  const keep = [...new Set([last, next].filter((w): w is string => !!w))];
  return db.transaction(async (tx) => {
    await lockUser(tx, "deload", userId);
    const had = (await tx.select({ week: deloadWeeks.weekStart }).from(deloadWeeks).where(eq(deloadWeeks.userId, userId))).map((r) => r.week);
    const removed = had.filter((w) => w >= thisWeek && !keep.includes(w)).sort();
    const added = keep.filter((w) => !had.includes(w)).sort();
    await swapDeloadWeeks(tx, userId, added, removed);
    const weeks = [...had.filter((w) => !removed.includes(w)), ...added].sort();
    return { last: weeks.filter((w) => w <= thisWeek).at(-1) ?? null, added, removed };
  });
}

/** Undo of `saveDeloadWeeks`: the weeks it removed come back and the weeks it added go (a repeated Undo changes nothing). */
export async function restoreDeloadWeeks(userId: string, { add, remove }: RestoreDeloadWeeksInput) {
  await db.transaction(async (tx) => {
    await lockUser(tx, "deload", userId);
    await swapDeloadWeeks(tx, userId, add, remove);
  });
}

async function swapDeloadWeeks(tx: Pick<typeof db, "delete" | "insert">, userId: string, add: string[], remove: string[]) {
  if (remove.length) await tx.delete(deloadWeeks).where(and(eq(deloadWeeks.userId, userId), inArray(deloadWeeks.weekStart, remove)));
  if (add.length) await tx.insert(deloadWeeks).values(add.map((weekStart) => ({ userId, weekStart }))).onConflictDoNothing();
}

/** "1 plate = X kg" of each exercise the user set one for (D-038), as exercise id → kg: one query for the whole page. */
export async function getPlateWeights(userId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ exerciseId: exercisePlateWeights.exerciseId, kg: exercisePlateWeights.kg })
    .from(exercisePlateWeights)
    .where(eq(exercisePlateWeights.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.exerciseId, Number(r.kg)]));
}

/**
 * Sets "1 plate = X kg" for one exercise (null clears it, the Undo of a first save). Only an exercise the user can see
 * (a shared one or their own) takes one: anything else answers null and nothing changes. Answers the kg it had before,
 * which Undo writes back.
 */
export async function savePlateWeight(userId: string, { exerciseId, kg }: SavePlateWeightInput) {
  return db.transaction(async (tx) => {
    // The lock a custom exercise's delete takes, so the exercise cannot go between the check and the write.
    await lockUser(tx, "exercise", userId);
    const [exercise] = await tx
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.id, exerciseId), or(isNull(exercises.userId), eq(exercises.userId, userId))));
    if (!exercise) return null;
    const mine = and(eq(exercisePlateWeights.userId, userId), eq(exercisePlateWeights.exerciseId, exerciseId));
    const [had] = await tx.select({ kg: exercisePlateWeights.kg }).from(exercisePlateWeights).where(mine);
    if (kg === null) await tx.delete(exercisePlateWeights).where(mine);
    else
      await tx
        .insert(exercisePlateWeights)
        .values({ userId, exerciseId, kg: String(kg) })
        .onConflictDoUpdate({ target: [exercisePlateWeights.userId, exercisePlateWeights.exerciseId], set: { kg: String(kg) } });
    return { previous: had ? Number(had.kg) : null };
  });
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
 * do not show. A workout still open (no duration) is not past yet. Only workouts
 * dated `since` or later, so the query stays bounded however long the history grows.
 */
export async function getWorkoutHistory(userId: string, since: string): Promise<HistorySession[]> {
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
        isNotNull(workoutSessions.durationMinutes),
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
    ex.sets.push({ reps: r.reps, loadType: r.loadType, load: setLoad(r.loadType, r.loadValue, r.extraKg) });
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
