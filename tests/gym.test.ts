import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", async () => (await import("./auth")).authModule);
import { authState, seedUser } from "./auth";

import { dayProgress, deloadWeeksIn, exerciseMeasure, exerciseSeries, exerciseUnit, kgDelta, progressSets, setKg, setLoad, weeksBetween, withProgress, type PlateWeights } from "@/lib/gym-progress";
import { addDays, toISODate, weekStart } from "@/lib/format-date";
import type { HistorySession, HistorySet } from "@/lib/gym";
import {
  cancelWorkoutSession,
  addCustomExercise,
  addWorkoutSession,
  deleteWorkoutSet,
  finishWorkoutSession,
  getDeloadStatus,
  getExercises,
  getOpenWorkoutSession,
  getUserSplitWithDays,
  getWorkoutHistory,
  getPlateWeights,
  getWorkoutSessionDetails,
  addWorkoutSet,
  EXERCISE_GONE,
} from "@/lib/gym";
import {
  cancelSessionAction,
  pauseSessionAction,
  resumeSessionAction,
  addCustomExerciseAction,
  deleteCustomExerciseAction,
  restoreCustomExerciseAction,
  updateCustomExerciseAction,
  deleteSetAction,
  finishSessionAction,
  addSetAction,
  reopenSessionAction,
  restoreDeloadWeeksAction,
  restoreSessionAction,
  saveDeloadWeeksAction,
  savePlateWeightAction,
  saveSessionNotesAction,
  saveSplitDayAction,
  addSessionAction,
} from "@/actions/gym";
import {
  AT_MOST_LOAD,
  AT_MOST_PLATE_KG,
  DELOAD_ORDER,
  exerciseNameKey,
  MIN_OVER_MAX,
  MORE_THAN_ZERO,
  NAME_REQUIRED,
  NAME_TOO_SHORT,
  NOT_NEGATIVE,
  NOTES_CHANGED,
  REPS_RANGE,
  ROUTINE_RANGE,
  SETS_LOGGED,
  WORKOUT_FINISHED,
  WORKOUT_GONE,
  ZERO_LOAD,
  type AddSetInput,
} from "@/lib/validations/gym";
import { alreadyExists, SIGNED_OUT } from "@/lib/validations/result";
import { FUTURE_DATE, NOTHING_TO_SAVE, TWO_DECIMALS } from "@/lib/validations/common";
import { refused, succeeded } from "./succeeded";
import { setExercises } from "@/../app/gym/active-workout";
import { canLog, emptyInput, inputProblem, outlierBest, type SetInput } from "@/../app/gym/exercise-logger";
import { plateKgProblem } from "@/../app/gym/progress-panel";
import { dayProblem, exerciseNameProblem } from "@/../app/gym/day-editor";
import { deloadProblem } from "@/../app/gym/deload-card";
import { setText } from "@/../app/gym/types";
import { resetDb } from "./db";

const TODAY = toISODate();
const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

describe("Gym module: Data Access, Logic & Authorization", () => {
  /** The first training day of a user's seeded routine (a workout starts only on one, D-039). */
  const trainingDay = async (userId: string) => (await getUserSplitWithDays(userId))!.days.find((d) => !d.isRest && d.exercises.length > 0)!;
  /** What Start sends for that day. */
  const startInput = async (userId: string, date = TODAY) => ({ date, isDeload: false, splitDayId: (await trainingDay(userId)).id });
  /** Starts a workout in the data layer (which has no today check) and answers its row. */
  const begin = async (userId: string, date = TODAY, isDeload = false) =>
    (await addWorkoutSession(userId, { ...(await startInput(userId, date)), isDeload }))!.session;
  /** A logged set's input, 8 × 40 kg unless told otherwise. */
  const setOf = (sessionId: string, exerciseId: string, more: Partial<AddSetInput> = {}): AddSetInput => ({
    sessionId, exerciseId, setOrder: 1, reps: 8, loadType: "kg", loadValue: 40, extraKg: 0,
    isFailure: true, isPartial: false, isGoodForm: true, flagAnomaly: false, ...more,
  });
  /**
   * A finished workout with one set: a user holds at most one open one (a unique index), and a Finish with no sets
   * deletes the workout (D-039), so the tests that only need history log a set and finish theirs.
   */
  const done = async (userId: string, date: string, isDeload = false) => {
    const session = await begin(userId, date, isDeload);
    await addWorkoutSet(userId, setOf(session.id, (await trainingDay(userId)).exercises[0].exerciseId));
    await finishWorkoutSession(userId, { sessionId: session.id });
    return session;
  };
  /** A user's workouts as stored. */
  const sessionsOf = async (userId: string) =>
    (await admin.query("SELECT * FROM workout_sessions WHERE user_id = $1 ORDER BY created_at", [userId])).rows;
  const setCount = async (sessionId: string) =>
    Number((await admin.query("SELECT count(*) AS n FROM workout_sets WHERE session_id = $1", [sessionId])).rows[0].n);
  /** A user's deload weeks as stored, oldest first. */
  const weeksOf = async (userId: string) =>
    (await admin.query("SELECT to_char(week_start, 'YYYY-MM-DD') AS w FROM deload_weeks WHERE user_id = $1 ORDER BY week_start", [userId])).rows.map((r) => r.w as string);
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    await resetDb(admin);
  });

  beforeEach(async () => {
    await resetDb(admin);
    userA = await seedUser(`user-a-${randomUUID()}`);
    userB = await seedUser(`user-b-${randomUUID()}`);
    authState.id = userA;
  });

  afterAll(async () => {
    await admin.end();
  });

  it("seeds default exercises and 5-day split on first split query", async () => {
    const split = await getUserSplitWithDays(userA);
    expect(split).not.toBeNull();
    expect(split?.name).toBe("Upper / Lower 5-Day");
    expect(split?.days).toHaveLength(7);

    // Verify Sunday is Upper (chest) with 7 exercises
    const sun = split?.days.find((d) => d.dayOfWeek === 0);
    expect(sun?.name).toBe("Upper (chest)");
    expect(sun?.isRest).toBe(false);
    expect(sun?.exercises.length).toBe(7);

    // Verify Tuesday is rest
    const tue = split?.days.find((d) => d.dayOfWeek === 2);
    expect(tue?.isRest).toBe(true);
    expect(tue?.exercises.length).toBe(0);
  });

  it("a first visit loading the split and the exercise list together seeds every default exactly once", async () => {
    const [split, list] = await Promise.all([getUserSplitWithDays(userA), getExercises(userA)]);
    expect(split?.days).toHaveLength(7);
    const names = list.filter((e) => e.userId === null).map((e) => e.name);
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
    expect(await getExercises(userA)).toHaveLength(list.length);
  });

  it("enforces multi-user isolation on custom exercises", async () => {
    const custom = await addCustomExercise(userA, {
      name: "B-Stance Hip Thrust",
      muscleGroup: "quads",
      equipmentType: "barbell",
    });
    expect(custom.id).toBeDefined();

    const userAExercises = await getExercises(userA);
    expect(userAExercises.some((e) => e.name === "B-Stance Hip Thrust")).toBe(true);

    const userBExercises = await getExercises(userB);
    expect(userBExercises.some((e) => e.name === "B-Stance Hip Thrust")).toBe(false);
  });

  it("undoes a custom exercise for its owner only, and never while a set uses it", async () => {
    const make = async (name: string) =>
      ((await addCustomExerciseAction({ name, muscleGroup: "quads", equipmentType: "barbell" })) as { exercise: { id: string } }).exercise;
    const fresh = await make("Undo Squat");

    authState.id = userB;
    expect(await deleteCustomExerciseAction(fresh.id)).toEqual(refused("This exercise no longer exists."));
    expect((await getExercises(userA)).some((e) => e.id === fresh.id)).toBe(true);
    authState.id = "";
    expect(await deleteCustomExerciseAction(fresh.id)).toEqual(refused(SIGNED_OUT));

    authState.id = userA;
    succeeded(await deleteCustomExerciseAction(fresh.id));
    expect((await getExercises(userA)).some((e) => e.id === fresh.id)).toBe(false);

    const used = await make("Used Squat");
    const { session } = succeeded(await addSessionAction(await startInput(userA)));
    succeeded(await addSetAction({ sessionId: session.id, exerciseId: used.id, setOrder: 1, reps: 5, loadType: "kg", loadValue: 50 }));
    expect(await deleteCustomExerciseAction(used.id)).toEqual(refused("This exercise is used by a routine or a workout, so it stays."));
    expect((await getExercises(userA)).some((e) => e.id === used.id)).toBe(true);
  });

  describe("saveSplitDayAction (edit routine)", () => {
    async function firstTrainingDay(userId: string) {
      const split = await getUserSplitWithDays(userId);
      return split!.days.find((d) => d.exercises.length > 1)!;
    }

    it("lets the owner rename, reorder and retarget a day", async () => {
      const day = await firstTrainingDay(userA);
      const [first, second] = day.exercises;
      succeeded(await saveSplitDayAction({
        id: day.id,
        name: "Push",
        isRest: false,
        exercises: [
          { exerciseId: second.exerciseId, targetSets: 3, minReps: 6, maxReps: 10 },
          { exerciseId: first.exerciseId, targetSets: 2, minReps: 5, maxReps: 8 },
        ],
      }));

      const after = (await getUserSplitWithDays(userA))!.days.find((d) => d.id === day.id)!;
      expect(after.name).toBe("Push");
      expect(after.exercises.map((e) => e.exerciseId)).toEqual([second.exerciseId, first.exerciseId]);
      expect(after.exercises[0]).toMatchObject({ targetSets: 3, minReps: 6, maxReps: 10 });
    });

    it("denies another user and leaves the day unchanged", async () => {
      const day = await firstTrainingDay(userA);
      authState.id = userB;
      const res = await saveSplitDayAction({ id: day.id, name: "Hacked", isRest: true, exercises: [] });
      expect(res).toEqual(refused("This day could not be saved."));

      const after = (await getUserSplitWithDays(userA))!.days.find((d) => d.id === day.id)!;
      expect(after.name).toBe(day.name);
      expect(after.exercises).toHaveLength(day.exercises.length);
    });

    it("rejects anonymous requests", async () => {
      const day = await firstTrainingDay(userA);
      authState.id = "";
      expect(await saveSplitDayAction({ id: day.id, name: "X", isRest: true, exercises: [] })).toEqual(refused(SIGNED_OUT));
    });

    it("rejects another user's custom exercise", async () => {
      const foreign = await addCustomExercise(userB, {
        name: "B only",
        muscleGroup: "biceps",
        equipmentType: "cable",
      });
      const day = await firstTrainingDay(userA);
      const res = await saveSplitDayAction({
        id: day.id,
        name: day.name,
        isRest: false,
        exercises: [{ exerciseId: foreign.id, targetSets: 2, minReps: 5, maxReps: 8 }],
      });
      expect(res).toEqual(refused("An exercise on this day no longer exists. Remove it and save again."));
      const after = (await getUserSplitWithDays(userA))!.days.find((d) => d.id === day.id)!;
      expect(after.exercises).toHaveLength(day.exercises.length);
    });

    it("rejects min reps above max reps and duplicates", async () => {
      const day = await firstTrainingDay(userA);
      const ex = day.exercises[0].exerciseId;
      expect(
        await saveSplitDayAction({
          id: day.id,
          name: day.name,
          isRest: false,
          exercises: [{ exerciseId: ex, targetSets: 2, minReps: 9, maxReps: 8 }],
        }),
      ).toEqual(refused(MIN_OVER_MAX));
      expect(
        await saveSplitDayAction({
          id: day.id,
          name: day.name,
          isRest: false,
          exercises: [
            { exerciseId: ex, targetSets: 2, minReps: 5, maxReps: 8 },
            { exerciseId: ex, targetSets: 2, minReps: 5, maxReps: 8 },
          ],
        }),
      ).toEqual(refused("Duplicate exercise"));
    });
  });

  it("flags '!!' when reps are below the day's minimum, and a client cannot switch that off", async () => {
    const split = await getUserSplitWithDays(userA);
    const day = split!.days.find((d) => d.exercises.length)!;
    const target = day.exercises[0];
    const session = (await addWorkoutSession(userA, { date: TODAY, isDeload: false, splitDayId: day.id }))!.session;
    const log = async (setOrder: number, reps: number) =>
      (await addWorkoutSet(userA, setOf(session.id, target.exerciseId, { setOrder, reps, loadValue: 60, isFailure: false })))!;

    const low = await log(1, target.minReps - 1);
    expect(low.flagAnomaly).toBe(true);
    expect(low.anomalyReason).toBe("too_heavy");

    const ok = await log(2, target.minReps);
    expect(ok.flagAnomaly).toBe(false);
    expect(ok.anomalyReason).toBeNull();
  });

  it("a workout without a routine day (from before D-039, or its day deleted) never flags a low rep count and lists the exercises of its own sets", async () => {
    const press = (await getExercises(userA)).find((e) => e.name === "Incline barbell press")!;
    const { rows } = await admin.query("INSERT INTO workout_sessions (user_id, date) VALUES ($1, $2) RETURNING id", [userA, TODAY]);
    const set = await addWorkoutSet(userA, setOf(rows[0].id, press.id, { reps: 1, loadValue: 60 }));
    expect(set!.flagAnomaly).toBe(false);
    const { sets } = (await getWorkoutSessionDetails(userA, rows[0].id))!;
    expect(sets.map((s) => s.exerciseName)).toEqual([press.name]);
    // The page lists its exercises from its own sets, never from the day picked on the page.
    expect(setExercises(sets).map((e) => [e.exerciseId, e.exerciseName, e.targetSets, e.minReps])).toEqual([[press.id, press.name, 1, 1]]);
  });

  it("starts a workout only on a training day of the user's own routine", async () => {
    const rest = (await getUserSplitWithDays(userA))!.days.find((d) => d.isRest)!;
    const noDay = refused("Pick a training day to start a workout.");
    expect(await addSessionAction({ date: TODAY, isDeload: false, splitDayId: rest.id })).toEqual(refused("A rest day has no workout. Pick a training day."));
    expect(await addSessionAction({ date: TODAY, isDeload: false })).toEqual(noDay);
    expect(await addSessionAction({ date: TODAY, isDeload: false, splitDayId: null })).toEqual(noDay);
    expect(await addSessionAction({ ...(await startInput(userB)) })).toEqual(refused("This day is no longer in your routine."));
    expect(await sessionsOf(userA)).toEqual([]);
    expect(await sessionsOf(userB)).toEqual([]);
  });

  it("keeps one workout per day: a Start sent twice, at once or from another tab is one row; another user's id makes nothing", async () => {
    const input = { ...(await startInput(userA)), id: randomUUID() };
    const [a, b] = await Promise.all([addSessionAction(input), addSessionAction(input)]);
    expect([succeeded(a).session.id, succeeded(b).session.id]).toEqual([input.id, input.id]);
    expect([succeeded(a).from, succeeded(b).from].sort()).toEqual(["new", "running"]);
    // Another tab sends its own id: today's workout comes back, still running
    expect(succeeded(await addSessionAction({ ...input, id: randomUUID() }))).toMatchObject({ session: { id: input.id }, from: "running" });
    expect((await sessionsOf(userA)).map((s) => s.id)).toEqual([input.id]);

    authState.id = userB; // B with A's id: nothing made, changed or told
    expect(await addSessionAction({ ...(await startInput(userB)), id: input.id })).toEqual(refused("This workout could not be started."));
    expect(await sessionsOf(userB)).toEqual([]);
    expect((await sessionsOf(userA)).map((s) => [s.id, s.duration_minutes])).toEqual([[input.id, null]]);
  });

  describe("Start on another day while today has a workout (D-039: one per date)", () => {
    const dayNamed = async (name: string) => (await getUserSplitWithDays(userA))!.days.find((d) => d.name === name)!;
    const startOn = (splitDayId: string) => addSessionAction({ id: randomUUID(), date: TODAY, isDeload: false, splitDayId });

    it("is refused, naming today's workout, whether it is running, paused or finished, and nothing changes", async () => {
      const [upper, legs] = [await dayNamed("Upper (chest)"), await dayNamed("Legs (hamstrings)")];
      const taken = refused('Today already has a workout: "Upper (chest)". Pick that day to keep going.');
      const first = succeeded(await startOn(upper.id));
      expect(first).toMatchObject({ from: "new", splitDayName: "Upper (chest)", session: { splitDayId: upper.id } });
      const sessionId = first.session.id;
      const refusedAndUnchanged = async () => {
        const before = await sessionsOf(userA);
        expect(await startOn(legs.id)).toEqual(taken);
        expect(await sessionsOf(userA)).toEqual(before);
        expect(before.map((s) => [s.id, s.split_day_id])).toEqual([[sessionId, upper.id]]);
      };
      await refusedAndUnchanged(); // running
      succeeded(await pauseSessionAction({ sessionId }));
      await refusedAndUnchanged(); // paused
      succeeded(await addSetAction(setOf(sessionId, upper.exercises[0].exerciseId)));
      succeeded(await finishSessionAction({ sessionId }));
      await refusedAndUnchanged(); // finished
      expect(await setCount(sessionId)).toBe(1);

      // Its own day still reopens it, under that day's name.
      expect(succeeded(await startOn(upper.id))).toMatchObject({ from: "finished", splitDayName: "Upper (chest)", session: { id: sessionId, splitDayId: upper.id } });
    });

    it("is refused with a plain message when today's workout has no day (from before D-039)", async () => {
      const { rows } = await admin.query("INSERT INTO workout_sessions (user_id, date) VALUES ($1, $2) RETURNING id", [userA, TODAY]);
      const before = await sessionsOf(userA);
      expect(await startOn((await dayNamed("Legs (hamstrings)")).id)).toEqual(refused("Today already has a workout."));
      expect(await sessionsOf(userA)).toEqual(before);
      expect(before.map((s) => s.id)).toEqual([rows[0].id]);
    });
  });

  describe("the workout timer lives on the server (D-039)", () => {
    // Only Date is faked: the database driver's own timers keep running.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    const at = (minutes: number) => vi.setSystemTime(new Date(Date.UTC(2026, 10, 20, 21, 30) + minutes * 60_000)); // 23:30 in Bucharest, plus

    it("pause and resume add up on every device, the server counts the duration and a Finish after midnight keeps the day", async () => {
      at(0);
      const session = await begin(userA, "2026-11-20");
      const ex = (await trainingDay(userA)).exercises[0].exerciseId;
      at(10);
      expect(await pauseSessionAction({ sessionId: session.id })).toEqual({ success: true, timer: { seconds: 600, running: false } });
      expect(await pauseSessionAction({ sessionId: session.id })).toEqual({ success: true, timer: { seconds: 600, running: false } }); // a repeat changes nothing
      at(40); // half an hour paused: another device reads the same stopped time
      expect((await getWorkoutSessionDetails(userA, session.id))!.timer).toEqual({ seconds: 600, running: false });
      expect(await resumeSessionAction({ sessionId: session.id })).toEqual({ success: true, timer: { seconds: 600, running: true } });
      at(41);
      expect((await getOpenWorkoutSession(userA))!.timer).toEqual({ seconds: 660, running: true });
      succeeded(await addSetAction(setOf(session.id, ex)));
      at(70); // 00:40 the next day
      const finished = succeeded(await finishSessionAction({ sessionId: session.id }));
      expect(finished.session).toMatchObject({ date: "2026-11-20", durationMinutes: 40, timerSeconds: 2400, timerRunningSince: null });
      expect(finished.timer).toEqual({ seconds: 2400, running: false });
      expect(await pauseSessionAction({ sessionId: session.id })).toEqual(refused(WORKOUT_FINISHED));
      expect(await resumeSessionAction({ sessionId: session.id })).toEqual(refused(WORKOUT_FINISHED));
    });

    it("Start on a day with a finished workout reopens it, its timer running on from the time it had", async () => {
      at(0);
      const first = await done(userA, "2026-11-20");
      at(5);
      const again = (await addWorkoutSession(userA, await startInput(userA, "2026-11-20")))!;
      expect(again).toMatchObject({ from: "finished", session: { id: first.id, durationMinutes: null }, timer: { seconds: 0, running: true } });
      at(8);
      expect((await getOpenWorkoutSession(userA))!.timer).toEqual({ seconds: 180, running: true });
      expect(await sessionsOf(userA)).toHaveLength(1);
      // Paused, then Start again: it runs on from where it stopped
      await pauseSessionAction({ sessionId: first.id });
      at(20);
      expect((await addWorkoutSession(userA, await startInput(userA, "2026-11-20")))!).toMatchObject({ from: "paused", timer: { seconds: 180, running: true } });
    });
  });

  it("refuses a second Finish and a set into a finished workout with one message, and changes nothing", async () => {
    const ex = (await trainingDay(userA)).exercises[0].exerciseId;
    const session = await begin(userA);
    succeeded(await addSetAction(setOf(session.id, ex)));
    succeeded(await saveSessionNotesAction({ sessionId: session.id, notes: { from: null, to: "first" } }));
    const first = succeeded(await finishSessionAction({ sessionId: session.id }));
    expect(first.deleted).toBe(false);
    const finished = refused(WORKOUT_FINISHED);
    expect(await finishSessionAction({ sessionId: session.id })).toEqual(finished);
    expect(await saveSessionNotesAction({ sessionId: session.id, notes: { from: "first", to: "second" } })).toEqual(finished);
    expect(await addSetAction(setOf(session.id, ex, { setOrder: 2 }))).toEqual(finished);
    expect(await addSetAction(setOf(session.id, ex, { setOrder: 2, id: randomUUID() }))).toEqual(finished);
    expect(await setCount(session.id)).toBe(1);
    expect((await sessionsOf(userA)).map((s) => [s.duration_minutes, s.notes])).toEqual([[first.session.durationMinutes, "first"]]);
  });

  it("Finish with no sets deletes the workout, and its Undo brings it back open with the same id, start and timer", async () => {
    const session = await begin(userA);
    await admin.query("UPDATE workout_sessions SET timer_seconds = 125, timer_running_since = NULL WHERE id = $1", [session.id]);
    const gone = succeeded(await finishSessionAction({ sessionId: session.id }));
    expect(gone).toMatchObject({ deleted: true, timer: { seconds: 125, running: false } });
    expect(await sessionsOf(userA)).toEqual([]);
    const { session: row, timer } = gone;
    const undo = { id: row.id, createdAt: row.createdAt, date: row.date, splitDayId: row.splitDayId, isDeload: row.isDeload, notes: row.notes, timerSeconds: timer.seconds, timerRunning: timer.running, sets: [] };
    const back = succeeded(await restoreSessionAction(undo));
    expect(back.details.session).toMatchObject({ id: session.id, createdAt: session.createdAt, splitDayId: session.splitDayId, durationMinutes: null, timerSeconds: 125, timerRunningSince: null });
    expect(back.details.timer).toEqual({ seconds: 125, running: false });
    expect(await restoreSessionAction(undo)).toEqual(refused("A workout is already open. Resume or finish it first.")); // a repeated Undo makes no second one
    expect(await sessionsOf(userA)).toHaveLength(1);
  });

  it("trims set and workout notes, saves a blank one as null and refuses one too long", async () => {
    const ex = (await trainingDay(userA)).exercises[0].exerciseId;
    const session = await begin(userA);
    const log = (setOrder: number, notes: string) => addSetAction(setOf(session.id, ex, { setOrder, notes }));
    expect(succeeded(await log(1, `  ${"a".repeat(255)}  `)).set.notes).toBe("a".repeat(255));
    expect(await log(2, "a".repeat(256))).toEqual(refused("Too long (max 255)"));
    expect(succeeded(await log(2, "   ")).set.notes).toBeNull();
    const save = (from: string | null, to: string) => saveSessionNotesAction({ sessionId: session.id, notes: { from, to } });
    expect(await save(null, "b".repeat(501))).toEqual(refused("Too long (max 500)"));
    expect(succeeded(await save(null, ` ${"b".repeat(500)}\n`)).notes).toBe("b".repeat(500));
    expect(succeeded(await save("b".repeat(500), "   ")).notes).toBeNull();
    expect(await save(null, "  ")).toEqual(refused(NOTHING_TO_SAVE));
  });

  describe("workout notes are saved with the open workout, sending the notes shown and the new ones (GYMB-03, GYMB-14, D-040)", () => {
    const notesOf = async (sessionId: string) => (await admin.query("SELECT notes FROM workout_sessions WHERE id = $1", [sessionId])).rows[0]?.notes;

    it("saves while the stored notes are the ones shown, refuses a change made elsewhere, and Finish keeps them", async () => {
      const session = await begin(userA);
      const save = (from: string | null, to: string | null) => saveSessionNotesAction({ sessionId: session.id, notes: { from, to } });
      expect(succeeded(await save(null, "  felt strong ")).notes).toBe("felt strong");
      // Another device still showing no notes: refused, and the notes stay
      expect(await save(null, "tired")).toEqual(refused(NOTES_CHANGED));
      expect(await save("something else", "tired")).toEqual(refused(NOTES_CHANGED));
      expect(await notesOf(session.id)).toBe("felt strong");
      // Its Undo: the saved notes back to the ones before
      expect(succeeded(await save("felt strong", null)).notes).toBeNull();
      succeeded(await save(null, "felt strong"));
      succeeded(await addSetAction(setOf(session.id, (await trainingDay(userA)).exercises[0].exerciseId)));
      expect(succeeded(await finishSessionAction({ sessionId: session.id })).session.notes).toBe("felt strong");
      expect(await save("felt strong", "later")).toEqual(refused(WORKOUT_FINISHED));
      expect(await notesOf(session.id)).toBe("felt strong");
    });

    it("refuses another user's workout and a signed-out caller, and their notes stay", async () => {
      const session = await begin(userA);
      succeeded(await saveSessionNotesAction({ sessionId: session.id, notes: { from: null, to: "mine" } }));
      const input = { sessionId: session.id, notes: { from: "mine", to: "not theirs" } };
      authState.id = userB;
      expect(await saveSessionNotesAction(input)).toEqual(refused(WORKOUT_GONE));
      authState.id = "";
      expect(await saveSessionNotesAction(input)).toEqual(refused(SIGNED_OUT));
      expect(await notesOf(session.id)).toBe("mine");
      authState.id = userA; // the owner may
      expect(succeeded(await saveSessionNotesAction(input)).notes).toBe("not theirs");
    });
  });

  describe("the server numbers a new set, so a log sends only what the device knows (GYMB-02, D-040)", () => {
    it("gives each exercise's next number, after a deleted last set too, and Undo of a delete keeps its own", async () => {
      const [a, b] = (await trainingDay(userA)).exercises.map((e) => e.exerciseId);
      const session = await begin(userA);
      // No set number unless told: the device sends only what it knows
      const log = async (exerciseId: string, more: Partial<AddSetInput> = {}) =>
        succeeded(await addSetAction(setOf(session.id, exerciseId, { id: randomUUID(), setOrder: undefined, ...more }))).set;
      expect((await log(a)).setOrder).toBe(1);
      const second = await log(a);
      expect(second.setOrder).toBe(2);
      expect((await log(b)).setOrder).toBe(1);
      const third = await log(a);
      expect(third.setOrder).toBe(3);
      succeeded(await deleteSetAction(second.id));
      expect((await log(a)).setOrder).toBe(4); // the highest plus one: a deleted middle set is not reused
      succeeded(await deleteSetAction(third.id));
      expect((await log(a, { id: second.id, setOrder: 2 })).setOrder).toBe(2); // Undo of the delete brings set 2 back as it was
    });

    it("Undo of a delete whose number a set logged meanwhile took gives it the number after the highest", async () => {
      const ex = (await trainingDay(userA)).exercises[0].exerciseId;
      const session = await begin(userA);
      const log = async (more: Partial<AddSetInput> = {}) =>
        succeeded(await addSetAction(setOf(session.id, ex, { id: randomUUID(), setOrder: undefined, ...more }))).set;
      await log();
      await log();
      const third = await log();
      succeeded(await deleteSetAction(third.id));
      expect((await log()).setOrder).toBe(3); // a new set 3
      expect((await log({ id: third.id, createdAt: third.createdAt, setOrder: 3 })).setOrder).toBe(4); // the Undo
      const numbers = await admin.query("SELECT set_order FROM workout_sets WHERE session_id = $1 ORDER BY set_order", [session.id]);
      expect(numbers.rows.map((r) => r.set_order)).toEqual([1, 2, 3, 4]);
    });

    it("ten sets written at once after sets 1 and 2, an Undo among them, take the numbers 3 to 12 with none repeated", async () => {
      const ex = (await trainingDay(userA)).exercises[0].exerciseId;
      const session = await begin(userA);
      const log = async (more: Partial<AddSetInput> = {}) =>
        succeeded(await addSetAction(setOf(session.id, ex, { id: randomUUID(), setOrder: undefined, ...more }))).set;
      await log();
      await log();
      const third = await log();
      succeeded(await deleteSetAction(third.id));
      // The numbers are read under the workout lock: read before it, writes at the same moment see one highest number and repeat it.
      await Promise.all([
        ...Array.from({ length: 9 }, () => log()),
        log({ id: third.id, createdAt: third.createdAt, setOrder: 3 }), // the Undo of the delete
      ]);
      const numbers = await admin.query("SELECT set_order FROM workout_sets WHERE session_id = $1 ORDER BY set_order", [session.id]);
      expect(numbers.rows.map((r) => r.set_order)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    });

    it("refuses a 51st set of one exercise", async () => {
      const ex = (await trainingDay(userA)).exercises[0].exerciseId;
      const session = await begin(userA);
      await admin.query(
        "INSERT INTO workout_sets (session_id, user_id, exercise_id, set_order, reps, load_type, load_value) SELECT $1, $2, $3, n, 8, 'kg', 40 FROM generate_series(1, 50) n",
        [session.id, userA, ex],
      );
      expect(await addSetAction(setOf(session.id, ex, { setOrder: undefined }))).toEqual(refused("At most 50 sets of one exercise in a workout."));
      expect(await setCount(session.id)).toBe(50);
    });
  });

  it("refuses a negative weight and one with more than two decimals, with the set form's words (GYMB-07, GYMB-09)", async () => {
    const ex = (await trainingDay(userA)).exercises[0].exerciseId;
    const session = await begin(userA);
    expect(await addSetAction(setOf(session.id, ex, { loadValue: -5 }))).toEqual(refused(NOT_NEGATIVE));
    expect(await addSetAction(setOf(session.id, ex, { loadValue: 42.125 }))).toEqual(refused(TWO_DECIMALS));
    expect(await addSetAction(setOf(session.id, ex, { extraKg: -1 }))).toEqual(refused(NOT_NEGATIVE));
    expect(await setCount(session.id)).toBe(0);
    expect(succeeded(await addSetAction(setOf(session.id, ex, { loadValue: 42.25 }))).set.loadValue).toBe("42.25");
  });

  it("refuses a weighted set of 0 kg or 0 plates with the set form's words, and logs a bodyweight set with 0 extra (Q5)", async () => {
    const ex = (await trainingDay(userA)).exercises[0].exerciseId;
    const session = await begin(userA);
    expect(await addSetAction(setOf(session.id, ex, { loadValue: 0 }))).toEqual(refused(ZERO_LOAD));
    expect(await addSetAction(setOf(session.id, ex, { loadType: "plates", loadValue: 0 }))).toEqual(refused(ZERO_LOAD));
    expect(await setCount(session.id)).toBe(0);
    expect(succeeded(await addSetAction(setOf(session.id, ex, { loadType: "bodyweight", loadValue: 0, extraKg: 0 }))).set.loadValue).toBe("0.00");
    expect(await setCount(session.id)).toBe(1);
  });

  it("checks a plate weight like the form: above 0, at most 100 kg, two decimals (GYMC-05)", async () => {
    const shared = (await getExercises(userA)).find((e) => e.userId === null)!.id;
    expect([MORE_THAN_ZERO, AT_MOST_PLATE_KG]).toEqual(["Must be more than 0", "Must be at most 100"]);
    // The form refuses each value with the server's own words for it (and keeps Save off for it).
    const refusals = [[0, MORE_THAN_ZERO], [-1, MORE_THAN_ZERO], [100.5, AT_MOST_PLATE_KG], [101, AT_MOST_PLATE_KG], [2.555, TWO_DECIMALS]] as const;
    for (const [kg, reason] of refusals) {
      expect(await savePlateWeightAction({ exerciseId: shared, kg })).toEqual(refused(reason));
      expect(plateKgProblem(String(kg))).toBe(reason);
    }
    for (const kg of ["0.5", "2.5", "100", ""]) expect(plateKgProblem(kg)).toBe("");
    expect(plateKgProblem("abc")).toBe(""); // the number field's own error ("Must be a number")
    expect(await getPlateWeights(userA)).toEqual({});
    expect(await savePlateWeightAction({ exerciseId: shared, kg: 2.25 })).toEqual({ success: true, previous: null });
    expect(await getPlateWeights(userA)).toEqual({ [shared]: 2.25 });
    expect(await getPlateWeights(userB)).toEqual({}); // per user
  });

  // The forms check before sending, with the schema's own words, so the user reads one message for one problem (U5).
  it("says a set's reps and load limits, a day's routine and name, a new exercise's name and the deload order in the server's words", async () => {
    const day = await trainingDay(userA);
    const ex = day.exercises[0].exerciseId;
    const session = await begin(userA);
    const exercise = { id: ex, exerciseId: ex, exerciseName: "Bench", muscleGroup: "chest", equipmentType: "barbell", targetSets: 3, minReps: 8, maxReps: 12, orderIndex: 0 };
    const form = (change: Partial<SetInput>): SetInput => ({ ...emptyInput(exercise), loadValue: "40", ...change });
    for (const reps of [0, 201, 1.5]) {
      expect(await addSetAction(setOf(session.id, ex, { reps }))).toEqual(refused(REPS_RANGE));
      expect(inputProblem(form({ reps: String(reps) }))).toBe(REPS_RANGE);
    }
    expect(await addSetAction(setOf(session.id, ex, { loadValue: 1000.5 }))).toEqual(refused(AT_MOST_LOAD));
    expect(inputProblem(form({ loadValue: "1000.5" }))).toBe(AT_MOST_LOAD);
    expect(await setCount(session.id)).toBe(0);

    const save = (exercises: { targetSets: number; minReps: number; maxReps: number }[], name = day.name) =>
      saveSplitDayAction({ id: day.id, name, isRest: false, exercises: exercises.map((r) => ({ exerciseId: ex, ...r })) });
    const named = (id: string) => (id === ex ? "Bench" : "?");
    const check = (rows: { targetSets: number; minReps: number; maxReps: number }[], name = day.name) =>
      dayProblem(name, rows.map((r) => ({ exerciseId: ex, ...r })), named);
    for (const row of [{ targetSets: 11, minReps: 5, maxReps: 8 }, { targetSets: 2, minReps: 0, maxReps: 8 }, { targetSets: 2, minReps: 5, maxReps: 101 }, { targetSets: 1.5, minReps: 5, maxReps: 8 }]) {
      expect(await save([row])).toEqual(refused(ROUTINE_RANGE));
      expect(check([row])).toBe(`Bench: ${ROUTINE_RANGE}`); // the form also names the exercise
    }
    expect(await save([{ targetSets: 2, minReps: 9, maxReps: 8 }])).toEqual(refused(MIN_OVER_MAX));
    expect(check([{ targetSets: 2, minReps: 9, maxReps: 8 }])).toBe(`Bench: ${MIN_OVER_MAX}`);
    for (const name of ["", "   "]) {
      expect(await save([{ targetSets: 2, minReps: 5, maxReps: 8 }], name)).toEqual(refused(NAME_REQUIRED));
      expect(check([{ targetSets: 2, minReps: 5, maxReps: 8 }], name)).toBe(NAME_REQUIRED);
    }
    expect(check([{ targetSets: 10, minReps: 1, maxReps: 100 }])).toBe("");

    // The new exercise form refuses a one-character name and a taken one before sending, as the server does.
    const custom = (name: string) => addCustomExerciseAction({ id: randomUUID(), name, muscleGroup: "chest", equipmentType: "barbell" });
    expect(await custom("B")).toEqual(refused(NAME_TOO_SHORT));
    expect(exerciseNameProblem("B", [])).toBe(NAME_TOO_SHORT);
    expect(await custom("incline  BARBELL press")).toEqual(refused(alreadyExists("Incline barbell press")));
    expect(exerciseNameProblem("incline  BARBELL press", [{ name: "Incline barbell press" }])).toBe(alreadyExists("Incline barbell press"));
    expect(exerciseNameProblem("Cable fly", [{ name: "Incline barbell press" }])).toBe("");

    const sunday = weekStart(TODAY);
    expect(await saveDeloadWeeksAction({ last: sunday, next: sunday })).toEqual(refused(DELOAD_ORDER));
    expect(deloadProblem(sunday, sunday)).toBe(DELOAD_ORDER);
    expect(deloadProblem(sunday, addDays(sunday, 7))).toBe("");
    expect(deloadProblem("", sunday)).toBe("");
  });

  // One way to do each job (U1, U9, U11): every Undo goes through `undoWith` (or `takeBack`, which wraps it), and the
  // weekday and a week's Sunday come from `src/lib/format-date.ts`, imported from there.
  it("keeps the gym code's Undo, weekday and week start to their one way", async () => {
    const sources = import.meta.glob(["../app/gym/**/*.{ts,tsx}", "../src/lib/gym*.ts", "../src/lib/validations/gym.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    const lines = (pattern: RegExp) =>
      Object.entries(sources).flatMap(([file, text]) => text.split("\n").flatMap((line, i) => (pattern.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])));
    expect(lines(/onUndo:(?!\s*(undoWith|takeBack)\()/)).toEqual([]);
    expect(lines(/\.getUTCDay\(/)).toEqual([]);
    expect(lines(/\bweekStart\b.*from "(\.\/|@\/lib\/)gym-progress"/)).toEqual([]);
    expect("weekStart" in (await import("@/lib/gym-progress"))).toBe(false);
  });

  it("takes a set's time only within its workout, and saves a bodyweight set with no extra kg", async () => {
    const ex = (await trainingDay(userA)).exercises[0].exerciseId;
    const session = await begin(userA);
    const start = session.createdAt.getTime();
    const outside = refused("A set's time must fall within its workout.");
    const log = (setOrder: number, createdAt: number) => addSetAction(setOf(session.id, ex, { setOrder, id: randomUUID(), createdAt: new Date(createdAt) }));
    succeeded(await log(1, start - 60_000)); // the device's clock may run a minute behind
    expect(await log(2, start - 60_001)).toEqual(outside);
    succeeded(await log(2, Date.now() + 50_000)); // ...or ahead
    expect(await log(3, Date.now() + 70_000)).toEqual(refused(FUTURE_DATE));
    expect(await setCount(session.id)).toBe(2);
    const bodyweight = succeeded(await addSetAction(setOf(session.id, ex, { setOrder: 3, loadType: "bodyweight", loadValue: 0, extraKg: 10 })));
    expect(bodyweight.set.extraKg).toBe("0.00");
  });

  it("a set sent twice with its device id is one row; another user's set id makes nothing and tells nothing", async () => {
    const ex = (await trainingDay(userA)).exercises[0].exerciseId;
    const session = await begin(userA);
    const input = setOf(session.id, ex, { id: randomUUID() });
    const both = await Promise.all([addSetAction(input), addSetAction(input)]);
    expect(both.map((r) => succeeded(r).set.id)).toEqual([input.id, input.id]);
    expect(await setCount(session.id)).toBe(1);

    authState.id = userB;
    const sessionB = await begin(userB);
    expect(await addSetAction({ ...setOf(sessionB.id, ex), id: input.id })).toEqual(refused("This set could not be saved."));
    expect(await setCount(sessionB.id)).toBe(0);
    expect((await admin.query("SELECT session_id FROM workout_sets WHERE id = $1", [input.id])).rows).toEqual([{ session_id: session.id }]);
  });

  it("answers another user's workout id with a refusal and writes nothing, on every workout action; signed out too", async () => {
    const ex = (await trainingDay(userA)).exercises[0].exerciseId;
    const session = await begin(userA);
    succeeded(await addSetAction(setOf(session.id, ex)));
    const before = await sessionsOf(userA);
    const sessionId = session.id;
    const calls = () => [
      pauseSessionAction({ sessionId }),
      resumeSessionAction({ sessionId }),
      finishSessionAction({ sessionId }),
      saveSessionNotesAction({ sessionId, notes: { from: null, to: "not theirs" } }),
      cancelSessionAction({ sessionId }),
      reopenSessionAction({ sessionId }),
      addSetAction(setOf(sessionId, ex, { setOrder: 2 })),
    ];
    authState.id = userB;
    for (const call of calls()) expect(await call).toEqual(refused(WORKOUT_GONE));
    authState.id = "";
    for (const call of calls()) expect(await call).toEqual(refused(SIGNED_OUT));
    expect(await sessionsOf(userA)).toEqual(before);
    expect(await setCount(sessionId)).toBe(1);

    authState.id = userA; // the owner may
    expect(succeeded(await pauseSessionAction({ sessionId })).timer.running).toBe(false);
    expect(succeeded(await resumeSessionAction({ sessionId })).timer.running).toBe(true);
    succeeded(await addSetAction(setOf(sessionId, ex, { setOrder: 2 })));
    expect(succeeded(await finishSessionAction({ sessionId })).deleted).toBe(false);
  });

  it("deleteSetAction refuses another user's set id and a signed-out caller, and their set stays as it was", async () => {
    const session = await begin(userA);
    const set = succeeded(await addSetAction(setOf(session.id, (await trainingDay(userA)).exercises[0].exerciseId))).set;
    const row = async () => (await admin.query("SELECT * FROM workout_sets WHERE id = $1", [set.id])).rows;
    const before = await row();
    authState.id = userB;
    expect(await deleteSetAction(set.id)).toEqual(refused("Set not found."));
    authState.id = "";
    expect(await deleteSetAction(set.id)).toEqual(refused(SIGNED_OUT));
    expect(await row()).toEqual(before);
    expect(before).toHaveLength(1);

    authState.id = userA; // the owner may
    expect(succeeded(await deleteSetAction(set.id)).deleted.id).toBe(set.id);
    expect(await row()).toEqual([]);
  });

  it("deleteSetAction refuses a set of a finished workout: it is history (D-039); another user and a signed-out caller learn nothing", async () => {
    const ex = (await trainingDay(userA)).exercises[0].exerciseId;
    const session = await begin(userA);
    const set = succeeded(await addSetAction(setOf(session.id, ex))).set;
    succeeded(await finishSessionAction({ sessionId: session.id }));
    expect(await deleteSetAction(set.id)).toEqual(refused(WORKOUT_FINISHED));
    authState.id = userB;
    expect(await deleteSetAction(set.id)).toEqual(refused("Set not found."));
    authState.id = "";
    expect(await deleteSetAction(set.id)).toEqual(refused(SIGNED_OUT));
    expect(await setCount(session.id)).toBe(1);
  });

  describe("a set logged with a custom exercise while it is deleted (both orders, and at once)", () => {
    async function setup() {
      const ex = succeeded(await addCustomExerciseAction({ name: `Race ${randomUUID()}`, muscleGroup: "chest", equipmentType: "barbell" })).exercise;
      const session = await begin(userA);
      return { ex, session, input: setOf(session.id, ex.id, { id: randomUUID() }) };
    }
    const exists = async (id: string) => (await getExercises(userA)).some((e) => e.id === id);

    it("log first: the delete is refused and the set stays", async () => {
      const { ex, session, input } = await setup();
      succeeded(await addSetAction(input));
      expect(await deleteCustomExerciseAction(ex.id)).toEqual(refused("This exercise is used by a routine or a workout, so it stays."));
      expect(await exists(ex.id)).toBe(true);
      expect(await setCount(session.id)).toBe(1);
    });

    it("delete first: the set is refused with that message and nothing is written", async () => {
      const { ex, session, input } = await setup();
      succeeded(await deleteCustomExerciseAction(ex.id));
      expect(await addSetAction(input)).toEqual(refused(EXERCISE_GONE));
      expect(await setCount(session.id)).toBe(0);
    });

    it("at once: exactly one wins and each ends cleanly", async () => {
      const { ex, session, input } = await setup();
      const [logged, deleted] = await Promise.all([addSetAction(input), deleteCustomExerciseAction(ex.id)]);
      expect([logged.success, deleted.success].sort()).toEqual([false, true]);
      expect(await exists(ex.id)).toBe(logged.success);
      expect(await setCount(session.id)).toBe(logged.success ? 1 : 0);
    });
  });

  it("edits and restores a custom exercise: owner only, no clash with another name, the restored row equals the original", async () => {
    await getExercises(userA);
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    const made = ((await addCustomExerciseAction({ ...input, name: "Edit Me" })) as { exercise: { id: string } }).exercise;
    await addCustomExerciseAction({ ...input, name: "Taken" });
    const edit = { id: made.id, name: "Edited", muscleGroup: "back", equipmentType: "cable" };

    authState.id = userB; // other user denied
    expect(await updateCustomExerciseAction(edit)).toEqual(refused(EXERCISE_GONE));
    expect(await restoreCustomExerciseAction(edit)).toEqual(refused("Exercise could not be restored.")); // A's id is taken, so B gets nothing of A's
    authState.id = "";
    expect(await updateCustomExerciseAction(edit)).toEqual(refused(SIGNED_OUT));
    expect(await restoreCustomExerciseAction(edit)).toEqual(refused(SIGNED_OUT));

    authState.id = userA;
    expect(await updateCustomExerciseAction({ ...edit, name: "taken" })).toEqual(refused('"Taken" already exists.')); // names the other one
    succeeded(await updateCustomExerciseAction({ ...edit, name: "edit ME" })); // its own name, other case
    succeeded(await updateCustomExerciseAction(edit));
    expect((await getExercises(userA)).find((e) => e.id === made.id)).toMatchObject({ name: "Edited", muscleGroup: "back", equipmentType: "cable", isCustom: true });
    expect(await updateCustomExerciseAction({ ...edit, id: randomUUID() })).toEqual(refused("This exercise no longer exists."));

    const [before] = (await getExercises(userA)).filter((e) => e.id === made.id);
    succeeded(await deleteCustomExerciseAction(made.id));
    const back = { id: made.id, name: before.name, muscleGroup: before.muscleGroup, equipmentType: before.equipmentType } as const;
    succeeded(await restoreCustomExerciseAction(back));
    succeeded(await restoreCustomExerciseAction(back)); // a repeated Undo changes nothing
    const [after] = (await getExercises(userA)).filter((e) => e.id === made.id);
    expect({ ...after, createdAt: 0 }).toEqual({ ...before, createdAt: 0 });
  });

  it("Undo of a rename is refused with the reason when another exercise took the old name since", async () => {
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    const made = succeeded(await addCustomExerciseAction({ ...input, name: "Old Name" })).exercise;
    succeeded(await updateCustomExerciseAction({ ...input, id: made.id, name: "New Name" }));
    succeeded(await addCustomExerciseAction({ ...input, name: "old name" })); // takes the freed name
    expect(await updateCustomExerciseAction({ ...input, id: made.id, name: "Old Name" })).toEqual(refused('"old name" already exists.'));
    expect((await getExercises(userA)).find((e) => e.id === made.id)?.name).toBe("New Name");
  });

  it("an add sent twice with its device id makes one row; another user's id creates, changes and tells nothing", async () => {
    const input = { id: randomUUID(), name: "Twice Row", muscleGroup: "back", equipmentType: "cable" } as const;
    const customRows = async (userId: string) =>
      (await admin.query("SELECT id, name, user_id FROM exercises WHERE is_custom AND user_id = $1", [userId])).rows;
    expect(succeeded(await addCustomExerciseAction(input)).exercise.id).toBe(input.id);
    expect(succeeded(await addCustomExerciseAction(input)).exercise.id).toBe(input.id);
    // and at the same moment (a double tap)
    const burst = { ...input, id: randomUUID(), name: "Burst Row" };
    const both = await Promise.all([addCustomExerciseAction(burst), addCustomExerciseAction(burst)]);
    expect(both.map((r) => succeeded(r).exercise.id)).toEqual([burst.id, burst.id]);
    expect((await customRows(userA)).map((r) => r.id).sort()).toEqual([input.id, burst.id].sort());

    authState.id = userB;
    expect(await addCustomExerciseAction({ ...input, name: "Not Theirs" })).toEqual(refused("This exercise could not be saved."));
    expect(await addCustomExerciseAction(input)).toEqual(refused("This exercise could not be saved."));
    expect(await customRows(userB)).toEqual([]);
    expect((await customRows(userA)).find((r) => r.id === input.id)).toMatchObject({ name: "Twice Row", user_id: userA });
  });

  it("compares names with inner spaces, case and a trailing period ignored, and names the exercise that has it", async () => {
    await getExercises(userA); // seeds the defaults
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    const made = succeeded(await addCustomExerciseAction({ ...input, name: "Bench press" })).exercise;
    const other = succeeded(await addCustomExerciseAction({ ...input, name: "Floor press" })).exercise;
    for (const name of ["Bench  press", "bench press.", "BENCH PRESS"]) {
      expect(await addCustomExerciseAction({ ...input, name })).toEqual(refused('"Bench press" already exists.'));
      expect(await updateCustomExerciseAction({ ...input, id: other.id, name })).toEqual(refused('"Bench press" already exists.'));
    }
    expect(await addCustomExerciseAction({ ...input, name: "flat  BARBELL bench press." })).toEqual(refused('"Flat barbell bench press" already exists.'));
    expect(succeeded(await updateCustomExerciseAction({ ...input, id: made.id, name: "BENCH  press." })).exercise.name).toBe("BENCH  press."); // its own name
    expect((await getExercises(userA)).filter((e) => e.isCustom).map((e) => e.name).sort()).toEqual(["BENCH  press.", "Floor press"]);
  });

  it("collapses the same spaces in the browser and on the server: a no-break space is one, an em space is not", async () => {
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    succeeded(await addCustomExerciseAction({ ...input, name: "Cable fly" }));
    expect(exerciseNameKey("Cable  fly.")).toBe(exerciseNameKey("cable fly"));
    expect(await addCustomExerciseAction({ ...input, name: "Cable  fly." })).toEqual(refused('"Cable fly" already exists.'));
    expect(exerciseNameKey("Cable fly")).not.toBe(exerciseNameKey("cable fly"));
    succeeded(await addCustomExerciseAction({ ...input, name: "Cable fly" }));
  });

  it("takes an exercise name of up to 120 characters and a day name of up to 100", async () => {
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    const made = succeeded(await addCustomExerciseAction({ ...input, name: "a".repeat(120) })).exercise;
    expect(made.name).toHaveLength(120);
    expect(await addCustomExerciseAction({ ...input, name: "b".repeat(121) })).toEqual(refused("Too long (max 120)"));
    expect(await updateCustomExerciseAction({ ...input, id: made.id, name: "c".repeat(121) })).toEqual(refused("Too long (max 120)"));
    const day = (await getUserSplitWithDays(userA))!.days[0];
    succeeded(await saveSplitDayAction({ id: day.id, name: "d".repeat(100), isRest: true, exercises: [] }));
    expect(await saveSplitDayAction({ id: day.id, name: "d".repeat(101), isRest: true, exercises: [] })).toEqual(refused("Too long (max 100)"));
  });

  it("answers an edit or delete of an exercise that is gone with that message", async () => {
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    const made = succeeded(await addCustomExerciseAction({ ...input, name: "Short Lived" })).exercise;
    succeeded(await deleteCustomExerciseAction(made.id));
    const gone = refused("This exercise no longer exists.");
    expect(await deleteCustomExerciseAction(made.id)).toEqual(gone);
    expect(await updateCustomExerciseAction({ ...input, id: made.id, name: "Renamed" })).toEqual(gone);
    const preset = (await getExercises(userA)).find((e) => !e.isCustom)!; // a default is never the user's to delete
    expect(await deleteCustomExerciseAction(preset.id)).toEqual(gone);
  });

  describe("a day saved while its new exercise is deleted (both orders, and at once)", () => {
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    async function setup() {
      const day = (await getUserSplitWithDays(userA))!.days.find((d) => d.exercises.length > 0)!;
      const ex = succeeded(await addCustomExerciseAction({ ...input, name: `Race ${randomUUID()}` })).exercise;
      const routine = day.exercises.map(({ exerciseId, targetSets, minReps, maxReps }) => ({ exerciseId, targetSets, minReps, maxReps }));
      const save = { id: day.id, name: "Raced", isRest: false, exercises: [...routine, { exerciseId: ex.id, targetSets: 2, minReps: 5, maxReps: 8 }] };
      return { day, ex, save };
    }
    const dayNow = async (id: string) => (await getUserSplitWithDays(userA))!.days.find((d) => d.id === id)!;
    const exists = async (id: string) => (await getExercises(userA)).some((e) => e.id === id);

    it("save first: the delete is refused and the day keeps the exercise", async () => {
      const { day, ex, save } = await setup();
      succeeded(await saveSplitDayAction(save));
      expect(await deleteCustomExerciseAction(ex.id)).toEqual(refused("This exercise is used by a routine or a workout, so it stays."));
      expect(await exists(ex.id)).toBe(true);
      expect((await dayNow(day.id)).exercises.map((e) => e.exerciseId)).toContain(ex.id);
    });

    it("delete first: the save is refused with a clear message and the day is left as it was", async () => {
      const { day, ex, save } = await setup();
      succeeded(await deleteCustomExerciseAction(ex.id));
      expect(await saveSplitDayAction(save)).toEqual(refused("An exercise on this day no longer exists. Remove it and save again."));
      const after = await dayNow(day.id);
      expect(after.name).toBe(day.name);
      expect(after.exercises.map((e) => e.exerciseId)).toEqual(day.exercises.map((e) => e.exerciseId));
    });

    it("at once: exactly one wins, and the day never holds half a save", async () => {
      const { day, ex, save } = await setup();
      const [saved, deleted] = await Promise.all([saveSplitDayAction(save), deleteCustomExerciseAction(ex.id)]);
      expect([saved.success, deleted.success].sort()).toEqual([false, true]);
      const after = await dayNow(day.id);
      if (saved.success) {
        expect(await exists(ex.id)).toBe(true);
        expect(after.exercises).toHaveLength(save.exercises.length);
      } else {
        expect(await exists(ex.id)).toBe(false);
        expect(after.name).toBe(day.name);
        expect(after.exercises).toHaveLength(day.exercises.length);
      }
    });
  });

  it("starts a workout only for today (a day of slack either side)", async () => {
    const input = await startInput(userA);
    expect(await addSessionAction({ ...input, date: addDays(TODAY, -5) })).toEqual(refused("A workout can only be started for today."));
    expect(await addSessionAction({ ...input, date: addDays(TODAY, 5) })).toEqual(refused("A workout can only be started for today."));
  });

  it("refuses a custom exercise whose name exists, ignoring case, among the defaults and the user's own", async () => {
    await getExercises(userA); // seeds the defaults
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    expect(await addCustomExerciseAction({ ...input, name: "incline BARBELL press" })).toEqual(refused(alreadyExists("Incline barbell press")));
    succeeded(await addCustomExerciseAction({ ...input, name: "My Press" }));
    const again = await addCustomExerciseAction({ ...input, name: "my press" });
    expect(again).toEqual(refused(alreadyExists("My Press")));
    // Another user may use the same name
    authState.id = userB;
    succeeded(await addCustomExerciseAction({ ...input, name: "My Press" }));
  });

  it("two custom exercises with one name made at once: exactly one is created", async () => {
    const input = { name: "Race Curl", muscleGroup: "biceps", equipmentType: "dumbbell" } as const;
    const results = await Promise.all([addCustomExerciseAction(input), addCustomExerciseAction({ ...input, name: "race curl" })]);
    expect(results.map((r) => r.success).sort()).toEqual([false, true]);
  });

  it("prevents cross-user session access and set manipulation", async () => {
    const press = (await getExercises(userA)).find((e) => e.name === "Incline barbell press")!;
    const sessionA = await begin(userA, "2026-10-29");
    const setA = (await addWorkoutSet(userA, setOf(sessionA.id, press.id)))!;

    // User B cannot read A's workout, log a set into it or delete A's set
    expect(await getWorkoutSessionDetails(userB, sessionA.id)).toBeNull();
    await expect(addWorkoutSet(userB, setOf(sessionA.id, press.id, { setOrder: 2 }))).rejects.toThrow(WORKOUT_GONE);
    expect(await deleteWorkoutSet(userB, setA.id)).toBeUndefined();

    // User A can view and delete their own set
    expect((await getWorkoutSessionDetails(userA, sessionA.id))?.sets).toHaveLength(1);
    expect((await deleteWorkoutSet(userA, setA.id))?.id).toBe(setA.id);
  });

  it("refuses another user's split day or custom exercise when creating a workout or logging a set", async () => {
    const dayA = (await trainingDay(userA)).id;
    const custom = await addCustomExercise(userA, { name: "Secret lift", muscleGroup: "chest", equipmentType: "barbell" });
    const sessionB = await begin(userB, "2026-10-29");

    await expect(addWorkoutSession(userB, { date: "2026-10-30", isDeload: false, splitDayId: dayA })).rejects.toThrow("This day is no longer in your routine.");
    await expect(addWorkoutSet(userB, setOf(sessionB.id, custom!.id, { reps: 5, loadValue: 10 }))).rejects.toThrow(EXERCISE_GONE);
    expect(await sessionsOf(userB)).toHaveLength(1);
    expect(await setCount(sessionB.id)).toBe(0);
  });

  it("answers a malformed set id with a validation error, not a database error", async () => {
    expect(await deleteSetAction("not-a-uuid")).toEqual(refused("Invalid id"));
  });

  it("counts Week x of N from the last and the next deload week", async () => {
    const weeksAgo = (n: number) => addDays(weekStart(toISODate()), -7 * n); // the Sunday n weeks back
    const status = async () => {
      const s = await getDeloadStatus(userA);
      return [s.cycleWeek, s.cycleLength, s.isDeloadDue, s.inDeloadWeek];
    };

    // No workout yet: week 1 of the default 5
    expect(await status()).toEqual([1, 5, false, false]);

    // The first workout starts the cycle; the deload is due once week 5 is over, and stays due (never wraps)
    const first = await done(userA, weeksAgo(3));
    expect(await status()).toEqual([4, 5, false, false]);
    await admin.query("UPDATE workout_sessions SET date = $2 WHERE id = $1", [first.id, weeksAgo(4)]);
    expect(await status()).toEqual([5, 5, false, false]);
    await admin.query("UPDATE workout_sessions SET date = $2 WHERE id = $1", [first.id, weeksAgo(5)]);
    expect(await status()).toEqual([5, 5, true, false]);
    await admin.query("UPDATE workout_sessions SET date = $2 WHERE id = $1", [first.id, weeksAgo(12)]);
    expect(await status()).toEqual([5, 5, true, false]);

    // A deload session alone does not make its week a deload week
    await done(userA, toISODate(), true);
    expect(await status()).toEqual([5, 5, true, false]);
    expect((await getDeloadStatus(userA)).lastDeloadWeek).toBeNull();

    // A chosen deload week is one: nothing is due, the week after it is week 1, five normal weeks later it is due again
    const thisWeek = weekStart(toISODate());
    await saveDeloadWeeksAction({ last: thisWeek, next: null });
    expect(await status()).toEqual([1, 5, false, true]);
    await saveDeloadWeeksAction({ last: addDays(thisWeek, -7), next: null });
    expect(await status()).toEqual([1, 5, false, false]);
    // A past week stays when Last moves earlier, so each other Last is tried on its own
    const lastOnly = async (week: string) => {
      await admin.query("DELETE FROM deload_weeks WHERE user_id = $1", [userA]);
      await saveDeloadWeeksAction({ last: week, next: null });
    };
    await lastOnly(addDays(thisWeek, -35));
    expect(await status()).toEqual([5, 5, false, false]);
    await lastOnly(addDays(thisWeek, -42));
    expect(await status()).toEqual([5, 5, true, false]);
  });

  it("derives Week x of N from a chosen last and next deload, and the chosen week is the deload week", async () => {
    const thisWeek = weekStart(toISODate());
    const at = (n: number) => addDays(thisWeek, 7 * n); // the Sunday n weeks from this one
    const status = async () => {
      const s = await getDeloadStatus(userA);
      return [s.cycleWeek, s.cycleLength, s.isDeloadDue, s.inDeloadWeek];
    };

    // Last deload 2 weeks ago, next in 4 weeks: five normal weeks between them, this is the 2nd
    await saveDeloadWeeksAction({ last: at(-2), next: at(4) });
    expect(await status()).toEqual([2, 5, false, false]);
    // Another length: last 2 weeks ago, next in 1 week: two normal weeks between them, this is the 2nd
    await saveDeloadWeeksAction({ last: at(-2), next: at(1) });
    expect(await status()).toEqual([2, 2, false, false]);
    // The next week is this one: "Deload week chosen"
    await saveDeloadWeeksAction({ last: at(-5), next: at(0) });
    expect(await getDeloadStatus(userA)).toMatchObject({ inDeloadWeek: true, isDeloadDue: false, lastDeloadWeek: at(0), nextDeloadWeek: null });
    // Only a next week: counted back from it with the default 5 (past weeks cleared first, since a save keeps them)
    await admin.query("DELETE FROM deload_weeks WHERE user_id = $1", [userA]);
    await saveDeloadWeeksAction({ last: null, next: at(2) });
    expect(await status()).toEqual([4, 5, false, false]);
  });

  it("chooses the last and next deload week: the plan changes, logged workouts keep their own flag, Undo restores", async () => {
    const thisWeek = weekStart(toISODate());
    const at = (n: number) => addDays(thisWeek, 7 * n);
    const flag = (n: number) => admin.query("SELECT is_deload FROM workout_sessions WHERE id = $1", [sessions[n].id]).then((r) => r.rows[0].is_deload);
    const sessions = [
      await done(userA, addDays(at(-6), 2)),
      await done(userA, addDays(at(-1), 2), true),
    ];

    await saveDeloadWeeksAction({ last: at(-1), next: at(4) });
    const before = await weeksOf(userA);
    expect(await getDeloadStatus(userA)).toMatchObject({ lastDeloadWeek: at(-1), nextDeloadWeek: at(4) });

    // A new next replaces the planned one; an earlier last adds that week and the later past week stays
    const saved = succeeded(await saveDeloadWeeksAction({ last: at(-6), next: at(3) }));
    expect(saved).toMatchObject({ last: at(-1), added: [at(-6), at(3)], removed: [at(4)] });
    expect(await getDeloadStatus(userA)).toMatchObject({ lastDeloadWeek: at(-1), nextDeloadWeek: at(3) });
    // ...and a workout counts as deload only when it was started as one (decision 2026-11-16): none is rewritten
    expect([await flag(0), await flag(1)]).toEqual([false, true]);

    // Undo swaps back exactly what the save changed; a repeated Undo changes nothing
    const undo = { add: saved.removed, remove: saved.added };
    succeeded(await restoreDeloadWeeksAction(undo));
    expect(await weeksOf(userA)).toEqual(before);
    succeeded(await restoreDeloadWeeksAction(undo));
    expect(await weeksOf(userA)).toEqual(before);
    expect([await flag(0), await flag(1)]).toEqual([false, true]);
  });

  it("never deletes a past deload week: Last \"Not set\" or an earlier week keeps them, and Undo restores the rows exactly", async () => {
    const thisWeek = weekStart(toISODate());
    const at = (n: number) => addDays(thisWeek, 7 * n);
    await admin.query("INSERT INTO deload_weeks (user_id, week_start) VALUES ($1, $2), ($1, $3), ($1, $4), ($1, $5)", [userA, at(-8), at(-3), at(0), at(2)]);
    const before = await weeksOf(userA);
    expect(before).toEqual([at(-8), at(-3), at(0), at(2)]);

    // "Not set": the plan (this week on) goes, the past stays, and the card's Last is the latest past week
    const cleared = succeeded(await saveDeloadWeeksAction({ last: null, next: null }));
    expect(cleared).toEqual({ success: true, last: at(-3), added: [], removed: [at(0), at(2)] });
    expect(await weeksOf(userA)).toEqual([at(-8), at(-3)]);
    succeeded(await restoreDeloadWeeksAction({ add: cleared.removed, remove: cleared.added }));
    expect(await weeksOf(userA)).toEqual(before);

    // An earlier week as Last: added, and the later past week still stands as the last one
    const earlier = succeeded(await saveDeloadWeeksAction({ last: at(-5), next: at(2) }));
    expect(earlier).toEqual({ success: true, last: at(-3), added: [at(-5)], removed: [at(0)] });
    expect(await weeksOf(userA)).toEqual([at(-8), at(-5), at(-3), at(2)]);
    succeeded(await restoreDeloadWeeksAction({ add: earlier.removed, remove: earlier.added }));
    expect(await weeksOf(userA)).toEqual(before);
  });

  it("restores deload weeks for the owner only: another user's call changes only their own weeks, anonymous is refused", async () => {
    const thisWeek = weekStart(toISODate());
    await saveDeloadWeeksAction({ last: thisWeek, next: null });
    const before = await weeksOf(userA);

    authState.id = userB;
    succeeded(await restoreDeloadWeeksAction({ add: [addDays(thisWeek, 7)], remove: [thisWeek] }));
    expect(await weeksOf(userA)).toEqual(before);
    expect(await weeksOf(userB)).toEqual([addDays(thisWeek, 7)]);

    authState.id = "";
    expect(await restoreDeloadWeeksAction({ add: [addDays(thisWeek, 14)], remove: [thisWeek] })).toEqual(refused(SIGNED_OUT));
    expect(await weeksOf(userA)).toEqual(before);

    authState.id = userA;
    succeeded(await restoreDeloadWeeksAction({ add: [], remove: [thisWeek] }));
    expect(await weeksOf(userA)).toEqual([]);
  });

  it("refuses a deload week that does not start on a Sunday or a next deload that is not after the last", async () => {
    const thisWeek = weekStart(toISODate());
    for (const [weeks, error] of [
      [{ last: addDays(thisWeek, 1), next: null }, "A deload week starts on a Sunday"],
      [{ last: addDays(thisWeek, 7), next: thisWeek }, DELOAD_ORDER],
      [{ last: thisWeek, next: thisWeek }, DELOAD_ORDER],
    ] as const) {
      expect(await saveDeloadWeeksAction(weeks)).toEqual(refused(error));
    }
  });

  it("keeps deload weeks per user and refuses anonymous callers", async () => {
    const sunday = weekStart(toISODate());
    await saveDeloadWeeksAction({ last: sunday, next: null });
    expect((await getDeloadStatus(userA)).lastDeloadWeek).toBe(sunday);
    expect((await getDeloadStatus(userB)).lastDeloadWeek).toBeNull();
    authState.id = userB;
    await saveDeloadWeeksAction({ last: null, next: null }); // B's own weeks, A's stay
    authState.id = "";
    expect(await saveDeloadWeeksAction({ last: sunday, next: null })).toEqual(refused(SIGNED_OUT));
    expect((await getDeloadStatus(userA)).lastDeloadWeek).toBe(sunday);
  });

  describe("Server Actions authorization & validation guards", () => {
    it("rejects unauthenticated requests", async () => {
      authState.id = ""; // Unauthenticated
      expect(await addSessionAction(await startInput(userA))).toEqual(refused(SIGNED_OUT));

      expect(
        await addSetAction({ sessionId: randomUUID(), exerciseId: randomUUID(), setOrder: 1, reps: 5, loadType: "kg", loadValue: 50 }),
      ).toEqual(refused(SIGNED_OUT));

      expect(await deleteSetAction(randomUUID())).toEqual(refused(SIGNED_OUT));
    });

    it("every other action refuses an anonymous caller", async () => {
      authState.id = "";
      const id = randomUUID();
      const denied = async (run: Promise<unknown>) => expect(await run).toEqual(refused(SIGNED_OUT));
      await denied(finishSessionAction({ sessionId: id }));
      await denied(saveSessionNotesAction({ sessionId: id, notes: { from: null, to: "x" } }));
      await denied(pauseSessionAction({ sessionId: id }));
      await denied(resumeSessionAction({ sessionId: id }));
      await denied(cancelSessionAction({ sessionId: id }));
      await denied(reopenSessionAction({ sessionId: id }));
      await denied(restoreSessionAction({ date: TODAY, isDeload: false, sets: [] }));
      await denied(saveSplitDayAction({ id, name: "x", isRest: true, exercises: [] }));
      await denied(addCustomExerciseAction({ name: "Anon lift", muscleGroup: "chest", equipmentType: "barbell" }));
      await denied(deleteCustomExerciseAction(id));
      await denied(saveDeloadWeeksAction({ last: null, next: null }));
      await denied(restoreDeloadWeeksAction({ add: [], remove: [] }));
      await denied(updateCustomExerciseAction({ id, name: "Anon lift", muscleGroup: "chest", equipmentType: "barbell" }));
      await denied(restoreCustomExerciseAction({ id, name: "Anon lift", muscleGroup: "chest", equipmentType: "barbell" }));
    });

    it("Undo of Cancel refuses a workout from long ago and a set id that is taken", async () => {
      const [exercise] = await getExercises(userA);
      const set = { exerciseId: exercise.id, setOrder: 1, reps: 5, loadType: "kg" as const, loadValue: 20, extraKg: 0, isFailure: false, isPartial: false, isGoodForm: true, flagAnomaly: false };
      expect(await restoreSessionAction({ date: addDays(TODAY, -30), isDeload: false, sets: [] })).toEqual(refused("This workout could not be restored."));
      const taken = await done(userA, addDays(TODAY, -10));
      const have = (await getWorkoutSessionDetails(userA, taken.id))!.sets[0];
      // The same set id again: a normal "could not restore", not a database error
      expect(await restoreSessionAction({ date: TODAY, isDeload: false, sets: [{ ...set, id: have.id }] })).toEqual(refused("This workout could not be restored."));
      expect(await sessionsOf(userA)).toHaveLength(1);
    });

    it("Undo of Cancel is refused on a day that has a workout again, and for a set timed outside its workout", async () => {
      const ex = (await trainingDay(userA)).exercises[0].exerciseId;
      const set = { exerciseId: ex, setOrder: 1, reps: 5, loadType: "kg" as const, loadValue: 20, extraKg: 0, isFailure: false, isPartial: false, isGoodForm: true, flagAnomaly: false };
      const start = new Date(Date.now() - 3_600_000);
      const early = { date: TODAY, isDeload: false, createdAt: start, sets: [{ ...set, createdAt: new Date(start.getTime() - 120_000) }] };
      expect(await restoreSessionAction(early)).toEqual(refused("This workout could not be restored."));
      expect(await sessionsOf(userA)).toEqual([]);
      await done(userA, TODAY);
      expect(await restoreSessionAction({ date: TODAY, isDeload: false, sets: [] })).toEqual(refused("This workout could not be restored."));
      expect(await sessionsOf(userA)).toHaveLength(1);
    });

    it("executes server actions successfully for authenticated owner", async () => {
      authState.id = userA;

      const exercisesList = await getExercises(userA);
      const exercise = exercisesList[0];

      // 1. Start session
      const startRes = succeeded(await addSessionAction(await startInput(userA)));
      expect(startRes.session.id).toBeDefined();

      // 2. Log set
      const logRes = succeeded(
        await addSetAction({
          sessionId: startRes.session.id,
          exerciseId: exercise.id,
          setOrder: 1,
          reps: 8,
          loadType: "kg",
          loadValue: 42.5,
          extraKg: 0,
          isFailure: true,
          isPartial: false,
          isGoodForm: true,
          flagAnomaly: false,
        }),
      );
      expect(logRes.set.reps).toBe(8);

      // 3. Delete set (only while the workout is open), and log another
      succeeded(await deleteSetAction(logRes.set.id));
      succeeded(await addSetAction({ sessionId: startRes.session.id, exerciseId: exercise.id, reps: 8, loadType: "kg", loadValue: 42.5 }));

      // 4. Finish session
      const finishRes = succeeded(
        await finishSessionAction({
          sessionId: startRes.session.id,
        }),
      );
      expect(finishRes.session.durationMinutes).toBe(1); // counted by the server: under a minute counts as one
    });
  });
  describe("cancelSessionAction and the open workout", () => {
    async function startWithSet(userId: string) {
      authState.id = userId;
      const [exercise] = await getExercises(userId);
      const { session } = succeeded(await addSessionAction(await startInput(userId)));
      succeeded(await addSetAction({ sessionId: session.id, exerciseId: exercise.id, setOrder: 1, reps: 8, loadType: "kg", loadValue: 40 }));
      return session.id;
    }

    it("lets the owner cancel a workout, sets included", async () => {
      const id = await startWithSet(userA);
      succeeded(await cancelSessionAction({ sessionId: id }));
      expect(await getWorkoutSessionDetails(userA, id)).toBeNull();
      const left = await admin.query("SELECT 1 FROM workout_sets WHERE session_id = $1", [id]);
      expect(left.rowCount).toBe(0);
    });

    it("denies another user and anonymous", async () => {
      const id = await startWithSet(userA);
      authState.id = userB;
      expect(await cancelSessionAction({ sessionId: id })).toEqual(refused(WORKOUT_GONE));
      expect(await cancelWorkoutSession(userB, id)).toBeUndefined();
      authState.id = "";
      expect(await cancelSessionAction({ sessionId: id })).toEqual(refused(SIGNED_OUT));
      expect(await getWorkoutSessionDetails(userA, id)).not.toBeNull();
    });

    it("rejects a malformed id", async () => {
      expect(await cancelSessionAction({ sessionId: "nope" })).toEqual(refused("Invalid id"));
    });

    // A page that still shows the workout open after another page finished it (D-039: a finished workout is history).
    it("refuses to cancel a finished workout and deletes nothing; another user and signed out learn nothing", async () => {
      const id = await startWithSet(userA);
      succeeded(await finishSessionAction({ sessionId: id }));
      const before = await sessionsOf(userA);
      expect(await cancelSessionAction({ sessionId: id })).toEqual(refused(WORKOUT_FINISHED));
      expect(await sessionsOf(userA)).toEqual(before);
      expect(await setCount(id)).toBe(1);
      authState.id = userB;
      expect(await cancelSessionAction({ sessionId: id })).toEqual(refused(WORKOUT_GONE));
      authState.id = "";
      expect(await cancelSessionAction({ sessionId: id })).toEqual(refused(SIGNED_OUT));
      expect(await sessionsOf(userA)).toEqual(before);
      expect(await setCount(id)).toBe(1);
    });

    // The Undo of "Started" sends onlyEmpty (D-046): a set logged meanwhile, on any device, keeps the workout.
    it("with onlyEmpty, refuses a workout that has a set and deletes nothing; another user and signed out learn nothing", async () => {
      const id = await startWithSet(userA);
      const before = await sessionsOf(userA);
      expect(await cancelSessionAction({ sessionId: id, onlyEmpty: true })).toEqual(refused(SETS_LOGGED));
      expect(await sessionsOf(userA)).toEqual(before);
      expect(await setCount(id)).toBe(1);
      authState.id = userB;
      expect(await cancelSessionAction({ sessionId: id, onlyEmpty: true })).toEqual(refused(WORKOUT_GONE));
      authState.id = "";
      expect(await cancelSessionAction({ sessionId: id, onlyEmpty: true })).toEqual(refused(SIGNED_OUT));
      expect(await sessionsOf(userA)).toEqual(before);
      expect(await setCount(id)).toBe(1);
    });

    it("with onlyEmpty, lets the owner cancel a workout with no set", async () => {
      authState.id = userA;
      const { session } = succeeded(await addSessionAction(await startInput(userA)));
      expect(succeeded(await cancelSessionAction({ sessionId: session.id, onlyEmpty: true })).timer.running).toBe(true);
      expect(await sessionsOf(userA)).toEqual([]);
    });

    /**
     * Runs `first` and `second` on the workout `id` so that each would see the other's write too late without the lock
     * they share: a row lock held here stops `first` at its write (after it read the workout), then `second` starts, and
     * both go once each waits on a lock. With the shared lock `second` waits for `first` to commit and reads its result;
     * without it, `second` reads the workout as `first` found it and both succeed (or the late one breaks).
     */
    async function overlap<A, B>(id: string, first: () => Promise<A>, second: () => Promise<B>) {
      // The backends waiting, directly or through another waiter, on the lock held here: only this test's own calls, never
      // another test's or another database's waits (pg_locks and pg_blocking_pids see the whole server).
      const waiting = async (n: number) =>
        vi.waitFor(
          async () => {
            const { rows } = await admin.query(
              `WITH RECURSIVE blocked(pid) AS (
                 SELECT pid FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))
                 UNION
                 SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid = ANY(pg_blocking_pids(a.pid))
               )
               SELECT count(*) AS n FROM blocked`,
              [holder],
            );
            expect(Number(rows[0].n)).toBe(n);
          },
          { timeout: 5000, interval: 20 },
        );
      const hold = await admin.connect();
      const holder = (await hold.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
      try {
        await hold.query("BEGIN");
        await hold.query("SELECT 1 FROM workout_sessions WHERE id = $1 FOR UPDATE", [id]);
        // Each is awaited below; the empty catch only keeps a rejection meanwhile from going unhandled.
        const a = first();
        a.catch(() => undefined);
        await waiting(1);
        const b = second();
        b.catch(() => undefined);
        await waiting(2);
        await hold.query("COMMIT");
        return [await a, await b] as const;
      } finally {
        await hold.query("ROLLBACK").catch(() => undefined);
        hold.release();
      }
    }

    // D-046: Cancel and Finish take the same lock, so the later one sees the earlier one's result, in either order.
    it("a Finish and then a Cancel at the same moment: the Finish wins and the Cancel is refused, deleting nothing", async () => {
      const id = await startWithSet(userA);
      const [finished, cancelled] = await overlap(id, () => finishSessionAction({ sessionId: id }), () => cancelSessionAction({ sessionId: id }));
      expect(finished).toMatchObject({ success: true, deleted: false });
      expect(cancelled).toEqual(refused(WORKOUT_FINISHED));
      expect((await sessionsOf(userA)).map((s) => s.duration_minutes)).toEqual([1]);
      expect(await setCount(id)).toBe(1);
    });

    it("a Cancel and then a Finish at the same moment: the Cancel wins and the Finish finds no workout", async () => {
      const id = await startWithSet(userA);
      const [cancelled, finished] = await overlap(id, () => cancelSessionAction({ sessionId: id }), () => finishSessionAction({ sessionId: id }));
      succeeded(cancelled);
      expect(finished).toEqual(refused(WORKOUT_GONE));
      expect(await sessionsOf(userA)).toEqual([]);
    });

    it("finds only the owner's unfinished recent workout", async () => {
      const id = await startWithSet(userA);
      const open = await getOpenWorkoutSession(userA);
      expect(open?.session.id).toBe(id);
      expect(open?.sets).toHaveLength(1);
      expect(await getOpenWorkoutSession(userB)).toBeNull();
      succeeded(await finishSessionAction({ sessionId: id }));
      expect(await getOpenWorkoutSession(userA)).toBeNull();
    });
  });
  describe("Undo of Finish and Cancel, and the workout History", () => {
    /** A workout with one set, left open (`minutes` null) or finished and given that duration. */
    async function finished(userId: string, date: string, minutes: number | null) {
      authState.id = userId;
      const [exercise] = await getExercises(userId);
      const session = await begin(userId, date);
      succeeded(await addSetAction({ sessionId: session.id, exerciseId: exercise.id, setOrder: 1, reps: 8, loadType: "kg", loadValue: 40 }));
      if (minutes) {
        succeeded(await finishSessionAction({ sessionId: session.id }));
        await admin.query("UPDATE workout_sessions SET duration_minutes = $2 WHERE id = $1", [session.id, minutes]);
      }
      return { id: session.id, exerciseId: exercise.id };
    }

    it("finishes a workout for the owner only", async () => {
      const { id } = await finished(userA, TODAY, null);
      authState.id = userB;
      expect(await finishSessionAction({ sessionId: id })).toEqual(refused(WORKOUT_GONE));
      authState.id = "";
      expect(await finishSessionAction({ sessionId: id })).toEqual(refused(SIGNED_OUT));
      expect((await getOpenWorkoutSession(userA))?.session.id).toBe(id);
      authState.id = userA;
      expect(await finishSessionAction({ sessionId: id })).toMatchObject({ success: true, deleted: false, session: { durationMinutes: 1 } });
    });

    it("reopens a finished workout for the owner only", async () => {
      const { id } = await finished(userA, TODAY, 50);
      authState.id = userB;
      expect(await reopenSessionAction({ sessionId: id })).toEqual(refused(WORKOUT_GONE));
      authState.id = "";
      expect(await reopenSessionAction({ sessionId: id })).toEqual(refused(SIGNED_OUT));
      expect(await getOpenWorkoutSession(userA)).toBeNull(); // still finished
      authState.id = userA;
      succeeded(await reopenSessionAction({ sessionId: id }));
      expect((await getOpenWorkoutSession(userA))?.session.id).toBe(id);
    });

    it("keeps one open workout: an old one still counts, and Undo of Finish or Cancel cannot make a second", async () => {
      const old = await finished(userA, addDays(TODAY, -30), null); // left open a month ago: still the open one
      expect((await getOpenWorkoutSession(userA))?.session.id).toBe(old.id);
      expect(await addSessionAction(await startInput(userA))).toEqual(refused("A workout is already open. Resume or finish it first."));
      succeeded(await finishSessionAction({ sessionId: old.id }));
      const started = succeeded(await addSessionAction(await startInput(userA)));
      expect(await reopenSessionAction({ sessionId: old.id })).toEqual(refused("A workout is already open. Resume or finish it first."));
      expect(await getOpenWorkoutSession(userA)).toMatchObject({ session: { id: started.session.id } });
      expect(await restoreSessionAction({ date: TODAY, isDeload: false, sets: [] })).toEqual(refused("A workout is already open. Resume or finish it first."));
    });

    it("restores a cancelled workout with its sets for the owner, as the caller's own", async () => {
      const { id, exerciseId } = await finished(userA, TODAY, null);
      const input = {
        date: TODAY,
        isDeload: false,
        sets: [{ exerciseId, setOrder: 1, reps: 8, loadType: "kg" as const, loadValue: 40, extraKg: 0, isFailure: true, isPartial: false, isGoodForm: true, flagAnomaly: false }],
      };
      await cancelSessionAction({ sessionId: id });
      const back = succeeded(await restoreSessionAction(input));
      expect(back.details.sets).toHaveLength(1);
      expect((await getOpenWorkoutSession(userA))?.session.id).toBe(back.details.session.id);

      authState.id = userB; // B restores under B: nothing of A's changes, and A's exercise stays out of reach
      const own = succeeded(await restoreSessionAction({ ...input, sets: [] }));
      expect(own.details.session.userId).toBe(userB);
      authState.id = "";
      expect(await restoreSessionAction(input)).toEqual(refused(SIGNED_OUT));
    });

    it("brings a cancelled workout back with the same ids and times, and refuses ids that are taken", async () => {
      const { id, exerciseId } = await finished(userA, TODAY, null);
      const before = (await getWorkoutSessionDetails(userA, id))!;
      const set = before.sets[0];
      await cancelSessionAction({ sessionId: id });
      const input = {
        id,
        createdAt: before.session.createdAt,
        date: TODAY,
        isDeload: false,
        sets: [{ id: set.id, createdAt: set.createdAt, exerciseId, setOrder: 1, reps: 8, loadType: "kg" as const, loadValue: 40, extraKg: 0, isFailure: false, isPartial: false, isGoodForm: false, flagAnomaly: false }],
      };
      const back = succeeded(await restoreSessionAction(input));
      expect(back.details.session.id).toBe(id);
      expect(back.details.session.createdAt).toEqual(before.session.createdAt);
      expect(back.details.sets[0].id).toBe(set.id);
      expect(back.details.sets[0].createdAt).toEqual(set.createdAt);
      expect(back.details.sets[0].isGoodForm).toBe(false); // the form flag survives the Undo
      // Restoring twice, or into an id another user holds, writes nothing.
      expect(await restoreSessionAction(input)).toEqual(refused("A workout is already open. Resume or finish it first."));
      authState.id = userB;
      expect(await restoreSessionAction({ ...input, sets: [] })).toEqual(refused("This workout could not be restored."));
      expect((await getWorkoutSessionDetails(userA, id))?.sets).toHaveLength(1);
    });

    it("restores a deleted set under its own id and time, and an id that is taken writes nothing", async () => {
      const { id, exerciseId } = await finished(userA, TODAY, null);
      const set = (await getWorkoutSessionDetails(userA, id))!.sets[0];
      await deleteSetAction(set.id);
      const input = { id: set.id, createdAt: set.createdAt, sessionId: id, exerciseId, setOrder: 1, reps: 8, loadType: "kg" as const, loadValue: 40 };
      const res = succeeded(await addSetAction(input));
      expect(res.set.id).toBe(set.id);
      expect(res.set.createdAt).toEqual(set.createdAt);
      // The same set sent again (a retry, D-040) answers the set that is there and writes nothing new.
      expect(succeeded(await addSetAction(input)).set.id).toBe(set.id);
      expect(await setCount(id)).toBe(1);
      authState.id = userB;
      expect(await addSetAction(input)).toEqual(refused(WORKOUT_GONE)); // not their workout
      expect(await setCount(id)).toBe(1);
    });

    it("Undo of Finish clears the duration and keeps the notes", async () => {
      const { id } = await finished(userA, TODAY, null);
      succeeded(await saveSessionNotesAction({ sessionId: id, notes: { from: null, to: "felt strong" } }));
      succeeded(await finishSessionAction({ sessionId: id }));
      expect((await getWorkoutSessionDetails(userA, id))?.session.notes).toBe("felt strong");
      const { timer } = succeeded(await reopenSessionAction({ sessionId: id }));
      expect(timer.running).toBe(true); // the timer runs on from the time it had
      const open = (await getWorkoutSessionDetails(userA, id))!.session;
      expect(open.durationMinutes).toBeNull();
      expect(open.notes).toBe("felt strong"); // the notes were typed before Finish, and Finish can be undone and repeated
    });

    it("does not link a restored workout to another user's day or exercise", async () => {
      const { exerciseId } = await finished(userA, TODAY, 50);
      const dayA = (await getUserSplitWithDays(userA))!.days[0].id;
      authState.id = userB;
      const withDay = succeeded(await restoreSessionAction({ date: TODAY, isDeload: false, splitDayId: dayA, sets: [] }));
      expect(withDay.details.session.splitDayId).toBeNull();
      succeeded(await cancelSessionAction({ sessionId: withDay.details.session.id })); // one open workout per user
      const custom = await addCustomExercise(userA, { name: "Secret lift", muscleGroup: "chest", equipmentType: "barbell" });
      const res = await restoreSessionAction({
        date: TODAY,
        isDeload: false,
        sets: [{ exerciseId: custom.id, setOrder: 1, reps: 5, loadType: "kg", loadValue: 10, extraKg: 0, isFailure: true, isPartial: false, isGoodForm: true, flagAnomaly: false }],
      });
      expect(res).toEqual(refused("This workout could not be restored."));
      expect(exerciseId).toBeTruthy();
    });

    it("lists the owner's finished workouts, newest first, and keeps the open one out", async () => {
      await finished(userA, "2026-11-01", 40);
      await finished(userA, "2026-11-03", 55);
      const open = await finished(userA, "2026-11-08", null);
      const list = await getWorkoutHistory(userA, "2026-01-01");
      expect(list.map((h) => h.date)).toEqual(["2026-11-03", "2026-11-01"]);
      expect(list[0]).toMatchObject({ durationMinutes: 55, isDeload: false });
      expect(list[0].exercises[0].sets).toEqual([{ reps: 8, loadType: "kg", load: 40 }]);
      expect(list.some((h) => h.id === open.id)).toBe(false);
      expect((await getWorkoutHistory(userA, "2026-11-02")).map((h) => h.date)).toEqual(["2026-11-03"]);
      expect(await getWorkoutHistory(userB, "2026-01-01")).toEqual([]);
    });
  });

  describe("progressSets (Progress view, drawn from the page's own data)", () => {
    it("joins finished and open workouts, oldest first, with names, loads and the deload flag", () => {
      const history: HistorySession[] = [
        { id: "s2", date: "2026-11-05", durationMinutes: 50, isDeload: true, dayId: "d", dayName: "Push",
          exercises: [{ id: "e1", name: "Bench", sets: [{ reps: 6, loadType: "kg", load: 45 }] }] },
        { id: "s1", date: "2026-11-03", durationMinutes: 55, isDeload: false, dayId: "d", dayName: "Push",
          exercises: [{ id: "e1", name: "Bench", sets: [{ reps: 8, loadType: "kg", load: 40 }, { reps: 7, loadType: "kg", load: 40 }] }] },
      ];
      const open = { id: "s3", date: "2026-11-07", isDeload: false, splitDayId: "d", splitDayName: "Push",
        sets: [{ exerciseId: "e2", setOrder: 1, reps: 10, loadType: "bodyweight_plus", loadValue: "0", extraKg: "12.5" }] };
      const sets = progressSets(history, open, new Map([["e2", "Dips"]]));
      expect(sets.map((s) => [s.date, s.setOrder, s.load])).toEqual([["2026-11-03", 1, 40], ["2026-11-03", 2, 40], ["2026-11-05", 1, 45], ["2026-11-07", 1, 12.5]]);
      expect(sets[2].isDeload).toBe(true);
      expect(sets[3]).toMatchObject({ sessionId: "s3", exerciseName: "Dips", dayName: "Push", reps: 10 });
      expect(progressSets([], null, new Map())).toEqual([]);
    });
  });

  describe("progress calculations", () => {
    const set = (date: string, load: number, reps: number, over: Partial<HistorySet> = {}): HistorySet => ({
      date, sessionId: "s", isDeload: false, dayId: "d", dayName: "Push", exerciseId: "e1", exerciseName: "Bench",
      setOrder: 1, reps, loadType: "kg", load, ...over,
    });

    it("finds the Sunday of a week (the week runs Sunday to Saturday)", () => {
      expect(weekStart("2026-11-08")).toBe("2026-11-08"); // Sunday
      expect(weekStart("2026-11-14")).toBe("2026-11-08"); // Saturday
      expect(weekStart("2026-11-15")).toBe("2026-11-15"); // the next Sunday
      expect(weekStart("2026-11-07")).toBe("2026-11-01");
    });

    const none = { plates: {}, deload: new Set<string>() };
    /** The rules with the deload weeks the sets and `chosen` give (`deloadWeeksIn`), and `plates`. */
    const rulesOf = (sets: HistorySet[], chosen: string[] = [], plates: PlateWeights = {}) => ({ plates, deload: deloadWeeksIn(chosen, sets) });

    it("keeps the best of each day", () => {
      const sets = [set("2026-11-02", 40, 8), set("2026-11-02", 50, 5), set("2026-11-04", 45, 5)];
      expect(exerciseSeries(sets, "e1", "kg", none)).toEqual([{ date: "2026-11-02", value: 50 }, { date: "2026-11-04", value: 45 }]);
    });

    it("leaves a deload week out of the chart whole: the deload workout and every other workout that week (GYMC-07, GYMA-18)", () => {
      const sets = [
        set("2026-11-02", 50, 8),
        set("2026-11-09", 30, 8, { isDeload: true }), // the deload workout
        set("2026-11-12", 45, 8), // another workout in the same week
        set("2026-11-16", 55, 8),
        set("2026-11-24", 20, 8), // a week the user chose as deload, with no workout started as one
      ];
      const rules = rulesOf(sets, ["2026-11-22"]);
      expect([...rules.deload].sort()).toEqual(["2026-11-08", "2026-11-22"]);
      expect(exerciseSeries(sets, "e1", "kg", rules).map((p) => p.date)).toEqual(["2026-11-02", "2026-11-16"]);
      // Done only in deload weeks: nothing to chart.
      expect(exerciseMeasure([set("2026-11-09", 30, 8, { isDeload: true })], "e1", rulesOf([set("2026-11-09", 30, 8, { isDeload: true })]), "reps")).toBeNull();
    });

    it("compares the week after a deload week with the week before it, and never compares the deload week (GYMC-07, GYMA-18)", () => {
      const sets = [set("2026-11-02", 100, 10), set("2026-11-09", 60, 10, { isDeload: true }), set("2026-11-12", 70, 10), set("2026-11-16", 110, 10)];
      const weeks = dayProgress(sets, "d", rulesOf(sets));
      expect(weeks.map((w) => w.week)).toEqual(["2026-11-01", "2026-11-15"]);
      expect(weeks.map((w) => w.change)).toEqual([null, 10]); // 110 against 100, not against the deload week's 70
    });

    it("gives each past workout its week's kg change against the week before; none for a first week, a deload week or a session with no day", () => {
      const sets = [
        set("2026-11-02", 100, 10),
        set("2026-11-09", 60, 10, { isDeload: true }),
        set("2026-11-11", 65, 10),
        set("2026-11-16", 110, 10),
      ];
      const session = (date: string, over: Partial<HistorySession> = {}): HistorySession => ({
        id: date, date, dayId: "d", dayName: "Push", durationMinutes: 50, isDeload: false, exercises: [], ...over,
      });
      const [first, deload, sameWeek, after, noDay] = withProgress(
        [session("2026-11-02"), session("2026-11-09", { isDeload: true }), session("2026-11-11"), session("2026-11-16"), session("2026-11-17", { dayId: null })],
        sets,
        rulesOf(sets),
      );
      expect(first).toMatchObject({ progress: null, deloadWeek: false }); // nothing before it
      expect(deload).toMatchObject({ progress: null, deloadWeek: true });
      expect(sameWeek).toMatchObject({ progress: null, deloadWeek: true }); // the whole week is a deload week
      expect(after.progress).toBeCloseTo(10); // against the week before the deload
      expect(after.deloadWeek).toBe(false);
      expect(noDay.progress).toBeNull();
      expect(kgDelta(2.5)).toBe("+2,5 kg"); // the app's number format (D-037)
      expect(kgDelta(5)).toBe("+5 kg");
      expect(kgDelta(-1234.5)).toBe("−1.234,5 kg");
      expect(kgDelta(-1)).toBe("−1 kg");
      expect(kgDelta(0)).toBe("0 kg");
      expect(kgDelta(null)).toBe("—");
    });

    it("never mixes plates and kg: extra kg is not added to plates, the chart follows the latest unit, a plate set counts in kg only with a plate weight", () => {
      expect(setLoad("kg", "40", "2.5")).toBe(42.5);
      expect(setLoad("bodyweight", "0", "10")).toBe(10);
      expect(setLoad("plates", "6", "2.5")).toBe(6);
      const sets = [
        set("2026-11-02", 60, 8), // kg
        set("2026-11-09", 6, 8, { loadType: "plates" }),
        set("2026-11-16", 7, 8, { loadType: "plates" }),
      ];
      expect(exerciseUnit(sets, "e1", none.deload)).toBe("plates");
      expect(exerciseUnit([], "e1", none.deload)).toBeNull();
      expect(exerciseMeasure(sets, "e1", none, "reps")).toBe("plates");
      expect(exerciseSeries(sets, "e1", "plates", none)).toEqual([{ date: "2026-11-09", value: 6 }, { date: "2026-11-16", value: 7 }]);
      // The week-over-week change reads kg only, so 60 kg to 6 plates is no "−54 kg".
      expect(dayProgress(sets, "d", none).map((w) => w.change)).toEqual([null]);
    });

    it("charts and compares a plate exercise in kg once 1 plate has a weight (GYMC-05)", () => {
      const plates = { e1: 10 };
      const sets = [
        set("2026-11-02", 60, 8), // kg
        set("2026-11-09", 6, 8, { loadType: "plates" }),
        set("2026-11-16", 6.5, 8, { loadType: "plates" }),
      ];
      expect(setKg(sets[1], plates)).toBe(60);
      expect(setKg(set("2026-11-09", 3, 8, { loadType: "plates" }), { e1: 2.27 })).toBe(6.81); // rounded to 2 decimals
      expect(setKg(sets[1], {})).toBeNull();
      expect(exerciseMeasure(sets, "e1", { plates, deload: new Set() }, "reps")).toBe("kg");
      expect(exerciseSeries(sets, "e1", "kg", { plates, deload: new Set() })).toEqual([
        { date: "2026-11-02", value: 60 },
        { date: "2026-11-09", value: 60 },
        { date: "2026-11-16", value: 65 },
      ]);
      expect(dayProgress(sets, "d", { plates, deload: new Set() }).map((w) => w.change)).toEqual([null, 0, 5]);
      // Another exercise's plate weight is not this one's.
      expect(exerciseSeries(sets, "e1", "kg", { plates: { e2: 10 }, deload: new Set() })).toEqual([{ date: "2026-11-02", value: 60 }]);
    });

    it("charts a bodyweight exercise by its reps or its added kg, and compares it by the added kg only (GYMC-06)", () => {
      const bw = (date: string, added: number, reps: number) => set(date, added, reps, { loadType: "bodyweight" });
      const sets = [bw("2026-11-02", 0, 12), bw("2026-11-02", 0, 10), bw("2026-11-09", 0, 14), bw("2026-11-16", 5, 8)];
      expect(exerciseMeasure(sets, "e1", none, "reps")).toBe("reps");
      expect(exerciseMeasure(sets, "e1", none, "added")).toBe("added");
      expect(exerciseSeries(sets, "e1", "reps", none)).toEqual([
        { date: "2026-11-02", value: 12 },
        { date: "2026-11-09", value: 14 },
        { date: "2026-11-16", value: 8 },
      ]);
      expect(exerciseSeries(sets, "e1", "added", none)).toEqual([{ date: "2026-11-16", value: 5 }]); // a set with none adds no point
      expect(exerciseSeries(sets.slice(0, 3), "e1", "added", none)).toEqual([]); // "No added weight yet"
      // Never on the kg chart, and in History only by the kg it adds: 0 kg weeks have nothing to compare.
      expect(exerciseSeries(sets, "e1", "kg", none)).toEqual([]);
      expect(setKg(bw("2026-11-02", 0, 12), {})).toBeNull();
      const added = [bw("2026-11-02", 0, 12), bw("2026-11-09", 5, 8), bw("2026-11-16", 7.5, 8)];
      expect(dayProgress(added, "d", none).map((w) => w.change)).toEqual([null, 2.5]);
    });

    it("counts whole calendar weeks between dates, Sunday to Saturday", () => {
      expect(weeksBetween("2026-11-08", "2026-11-14")).toBe(0); // Sunday to Saturday of one week
      expect(weeksBetween("2026-11-14", "2026-11-15")).toBe(1); // Saturday to the next Sunday
      expect(weeksBetween("2026-11-22", "2026-11-08")).toBe(-2);
      expect(weeksBetween("2026-03-25", "2026-04-02")).toBe(1); // across a clock change
    });

    it("averages the week-over-week kg change across exercises", () => {
      const sets = [
        set("2026-11-02", 100, 10, { exerciseId: "e1" }),
        set("2026-11-09", 110, 10, { exerciseId: "e1" }), // +10 kg
        set("2026-11-02", 50, 10, { exerciseId: "e2" }),
        set("2026-11-09", 50, 12, { exerciseId: "e2" }), // no change
        set("2026-11-09", 30, 8, { exerciseId: "e3" }), // no previous week: not counted
      ];
      const [first, second] = dayProgress(sets, "d", none);
      expect(first).toEqual({ week: "2026-11-01", change: null });
      expect(second.change).toBeCloseTo(5);
      expect(dayProgress(sets, "other", none)).toEqual([]);
    });
  });

  describe("the set form (GYMB-07, GYMB-08, GYMB-18, GYMC-09, GYMB-09)", () => {
    const exercise = { id: "x", exerciseId: "x", exerciseName: "Bench", muscleGroup: "chest", equipmentType: "barbell", targetSets: 3, minReps: 8, maxReps: 12, orderIndex: 0 };
    const form = (change: Partial<SetInput>): SetInput => ({ ...emptyInput(exercise), ...change });

    it("starts every check unchecked (GYMB-18)", () => {
      expect(emptyInput(exercise)).toMatchObject({ isFailure: false, isPartial: false, isGoodForm: false, loadValue: "" });
    });

    it("says why a value cannot be logged, in the server's words (GYMB-07, GYMB-08)", () => {
      expect(inputProblem(form({ loadValue: "-5" }))).toBe(NOT_NEGATIVE);
      expect(inputProblem(form({ loadValue: "2.555" }))).toBe(TWO_DECIMALS);
      expect(inputProblem(form({ loadValue: "100000" }))).toBe(AT_MOST_LOAD);
      expect(inputProblem(form({ loadValue: "0" }))).toBe(ZERO_LOAD);
      expect(inputProblem(form({ loadValue: "0", loadType: "plates" }))).toBe(ZERO_LOAD);
      expect(canLog(form({ loadValue: "0" }))).toBe(false);
      // A bodyweight set takes 0 (no extra weight); an empty field stays quiet; text is the number field's own error.
      expect(inputProblem(form({ loadValue: "0", loadType: "bodyweight" }))).toBe("");
      expect(canLog(form({ loadValue: "0", loadType: "bodyweight" }))).toBe(true);
      expect(inputProblem(form({ loadValue: "" }))).toBe("");
      expect(inputProblem(form({ loadValue: "abc" }))).toBe("");
      expect(canLog(form({ loadValue: "abc" }))).toBe(false);
      expect(canLog(form({ loadValue: "62.5" }))).toBe(true);
    });

    it("asks twice for a load more than 50% above the best in the same unit (GYMC-09, D-038)", () => {
      const sets = [{ loadType: "kg", load: 60 }, { loadType: "kg", load: 80 }, { loadType: "plates", load: 300 }];
      expect(outlierBest(121, "kg", sets)).toBe(80);
      expect(outlierBest(120, "kg", sets)).toBeNull(); // exactly 50% above is not an outlier
      expect(outlierBest(13, "plates", [{ loadType: "plates", load: 8 }, { loadType: "kg", load: 2 }])).toBe(8);
      expect(outlierBest(500, "kg", [])).toBeNull(); // nothing to compare with yet
      expect(outlierBest(500, "kg", [{ loadType: "plates", load: 8 }])).toBeNull();
    });

    it("writes a set in the app's number format (GYMB-09, GYMB-19)", () => {
      expect(setText({ reps: 5, loadType: "kg", load: 60 })).toBe("5 × 60 kg");
      expect(setText({ reps: 8, loadType: "kg", load: 12.5 })).toBe("8 × 12,5 kg");
      expect(setText({ reps: 1, loadType: "kg", load: 1000 })).toBe("1 × 1.000 kg");
      expect(setText({ reps: 10, loadType: "plates", load: 7 })).toBe("10 × 7 plates");
      expect(setText({ reps: 12, loadType: "bodyweight", load: 7.5 })).toBe("12 × BW + 7,5 kg");
      expect(setText({ reps: 12, loadType: "bodyweight", load: 0 })).toBe("12 × BW");
    });
  });
});
