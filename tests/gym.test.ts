import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", async () => (await import("./auth")).authModule);
import { authState, seedUser } from "./auth";

import { dayProgress, exerciseSeries, exerciseUnit, kgDelta, progressSets, setLoad, weekStart, weeksBetween, withProgress } from "@/lib/gym-progress";
import { addDays, toISODate } from "@/lib/format-date";
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
  getWorkoutSessionDetails,
  logWorkoutSet,
} from "@/lib/gym";
import {
  cancelSessionAction,
  addCustomExerciseAction,
  deleteCustomExerciseAction,
  restoreCustomExerciseAction,
  updateCustomExerciseAction,
  deleteSetAction,
  finishSessionAction,
  logSetAction,
  reopenSessionAction,
  restoreDeloadWeeksAction,
  restoreSessionAction,
  saveDeloadWeeksAction,
  saveSplitDayAction,
  startSessionAction,
} from "@/actions/gym";
import { SIGNED_OUT } from "@/lib/validations/result";
import { succeeded } from "./succeeded";

const TODAY = toISODate();
const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

describe("Gym module: Data Access, Logic & Authorization", () => {
  /** A finished workout: a user holds at most one open one (a unique index), so the tests that only need history finish theirs. */
  const done = async <T extends { id: string }>(session: T) => {
    await finishWorkoutSession(userA, { sessionId: session.id, durationMinutes: 45 });
    return session;
  };
  /** A user's deload weeks as stored, oldest first. */
  const weeksOf = async (userId: string) =>
    (await admin.query("SELECT to_char(week_start, 'YYYY-MM-DD') AS w FROM deload_weeks WHERE user_id = $1 ORDER BY week_start", [userId])).rows.map((r) => r.w as string);
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    await admin.query("TRUNCATE TABLE workout_sets, workout_sessions, workout_split_day_exercises, workout_split_days, workout_splits, exercises, weight_entries, users CASCADE");
  });

  beforeEach(async () => {
    await admin.query("TRUNCATE TABLE workout_sets, workout_sessions, workout_split_day_exercises, workout_split_days, workout_splits, exercises, weight_entries, users CASCADE");
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
    expect(await deleteCustomExerciseAction(fresh.id)).toEqual({ success: false, error: "This exercise no longer exists." });
    expect((await getExercises(userA)).some((e) => e.id === fresh.id)).toBe(true);
    authState.id = "";
    expect(await deleteCustomExerciseAction(fresh.id)).toEqual({ success: false, error: SIGNED_OUT });

    authState.id = userA;
    expect((await deleteCustomExerciseAction(fresh.id)).success).toBe(true);
    expect((await getExercises(userA)).some((e) => e.id === fresh.id)).toBe(false);

    const used = await make("Used Squat");
    const { session } = (await startSessionAction({ date: TODAY, isDeload: false })) as { session: { id: string } };
    await logSetAction({ sessionId: session.id, exerciseId: used.id, setOrder: 1, reps: 5, loadType: "kg", loadValue: 50 });
    expect(await deleteCustomExerciseAction(used.id)).toEqual({ success: false, error: "This exercise is used by a routine or a workout, so it stays." });
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
      const res = await saveSplitDayAction({
        id: day.id,
        name: "Push",
        isRest: false,
        exercises: [
          { exerciseId: second.exerciseId, targetSets: 3, minReps: 6, maxReps: 10 },
          { exerciseId: first.exerciseId, targetSets: 2, minReps: 5, maxReps: 8 },
        ],
      });
      expect(res.success).toBe(true);

      const after = (await getUserSplitWithDays(userA))!.days.find((d) => d.id === day.id)!;
      expect(after.name).toBe("Push");
      expect(after.exercises.map((e) => e.exerciseId)).toEqual([second.exerciseId, first.exerciseId]);
      expect(after.exercises[0]).toMatchObject({ targetSets: 3, minReps: 6, maxReps: 10 });
    });

    it("denies another user and leaves the day unchanged", async () => {
      const day = await firstTrainingDay(userA);
      authState.id = userB;
      const res = await saveSplitDayAction({ id: day.id, name: "Hacked", isRest: true, exercises: [] });
      expect(res.success).toBe(false);

      const after = (await getUserSplitWithDays(userA))!.days.find((d) => d.id === day.id)!;
      expect(after.name).toBe(day.name);
      expect(after.exercises).toHaveLength(day.exercises.length);
    });

    it("rejects anonymous requests", async () => {
      const day = await firstTrainingDay(userA);
      authState.id = "";
      expect(await saveSplitDayAction({ id: day.id, name: "X", isRest: true, exercises: [] })).toEqual({ success: false, error: SIGNED_OUT });
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
      expect(res).toEqual({ success: false, error: "An exercise on this day no longer exists. Remove it and save again." });
      const after = (await getUserSplitWithDays(userA))!.days.find((d) => d.id === day.id)!;
      expect(after.exercises).toHaveLength(day.exercises.length);
    });

    it("rejects min reps above max reps and duplicates", async () => {
      const day = await firstTrainingDay(userA);
      const ex = day.exercises[0].exerciseId;
      await expect(
        saveSplitDayAction({
          id: day.id,
          name: day.name,
          isRest: false,
          exercises: [{ exerciseId: ex, targetSets: 2, minReps: 9, maxReps: 8 }],
        }),
      ).resolves.toMatchObject({ success: false, error: expect.any(String) });
      await expect(
        saveSplitDayAction({
          id: day.id,
          name: day.name,
          isRest: false,
          exercises: [
            { exerciseId: ex, targetSets: 2, minReps: 5, maxReps: 8 },
            { exerciseId: ex, targetSets: 2, minReps: 5, maxReps: 8 },
          ],
        }),
      ).resolves.toMatchObject({ success: false, error: expect.any(String) });
    });
  });

  it("flags '!!' when reps are below the day's minimum, and a client cannot switch that off", async () => {
    const split = await getUserSplitWithDays(userA);
    const day = split!.days.find((d) => d.exercises.length)!;
    const target = day.exercises[0];
    const session = await addWorkoutSession(userA, { date: TODAY, isDeload: false, splitDayId: day.id });
    const log = (setOrder: number, reps: number) =>
      logWorkoutSet(userA, {
        sessionId: session.id, exerciseId: target.exerciseId, setOrder, reps, loadType: "kg", loadValue: 60, extraKg: 0,
        isFailure: false, isPartial: false, isGoodForm: true, flagAnomaly: false,
      });

    const low = await log(1, target.minReps - 1);
    expect(low.flagAnomaly).toBe(true);
    expect(low.anomalyReason).toBe("too_heavy");

    const ok = await log(2, target.minReps);
    expect(ok.flagAnomaly).toBe(false);
    expect(ok.anomalyReason).toBeNull();
  });

  it("a workout without a routine day never flags a low rep count", async () => {
    const press = (await getExercises(userA)).find((e) => e.name === "Incline barbell press")!;
    const session = await addWorkoutSession(userA, { date: TODAY, isDeload: false });
    const set = await logWorkoutSet(userA, {
      sessionId: session.id, exerciseId: press.id, setOrder: 1, reps: 1, loadType: "kg", loadValue: 60, extraKg: 0,
      isFailure: false, isPartial: false, isGoodForm: true, flagAnomaly: false,
    });
    expect(set.flagAnomaly).toBe(false);
  });

  it("allows one open workout at a time, and one start at a time under a double tap", async () => {
    const [a, b] = await Promise.all([
      startSessionAction({ date: TODAY, isDeload: false }),
      startSessionAction({ date: TODAY, isDeload: false }),
    ]);
    expect([a.success, b.success].sort()).toEqual([false, true]);
    const refused = [a, b].find((r) => !r.success) as { error: string };
    expect(refused.error).toMatch(/already open/i);
  });

  it("edits and restores a custom exercise: owner only, no clash with another name, the restored row equals the original", async () => {
    await getExercises(userA);
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    const made = ((await addCustomExerciseAction({ ...input, name: "Edit Me" })) as { exercise: { id: string } }).exercise;
    await addCustomExerciseAction({ ...input, name: "Taken" });
    const edit = { id: made.id, name: "Edited", muscleGroup: "back", equipmentType: "cable" };

    authState.id = userB; // other user denied
    expect((await updateCustomExerciseAction(edit)).success).toBe(false);
    expect((await restoreCustomExerciseAction(edit)).success).toBe(false); // A's id is taken, so B gets nothing of A's
    authState.id = "";
    expect(await updateCustomExerciseAction(edit)).toEqual({ success: false, error: SIGNED_OUT });
    expect(await restoreCustomExerciseAction(edit)).toEqual({ success: false, error: SIGNED_OUT });

    authState.id = userA;
    expect(await updateCustomExerciseAction({ ...edit, name: "taken" })).toEqual({ success: false, error: '"Taken" already exists.' }); // names the other one
    expect((await updateCustomExerciseAction({ ...edit, name: "edit ME" })).success).toBe(true); // its own name, other case
    expect((await updateCustomExerciseAction(edit)).success).toBe(true);
    expect((await getExercises(userA)).find((e) => e.id === made.id)).toMatchObject({ name: "Edited", muscleGroup: "back", equipmentType: "cable", isCustom: true });
    expect(await updateCustomExerciseAction({ ...edit, id: randomUUID() })).toEqual({ success: false, error: "This exercise no longer exists." });

    const [before] = (await getExercises(userA)).filter((e) => e.id === made.id);
    expect((await deleteCustomExerciseAction(made.id)).success).toBe(true);
    const back = { id: made.id, name: before.name, muscleGroup: before.muscleGroup, equipmentType: before.equipmentType } as const;
    expect((await restoreCustomExerciseAction(back)).success).toBe(true);
    expect((await restoreCustomExerciseAction(back)).success).toBe(true); // a repeated Undo changes nothing
    const [after] = (await getExercises(userA)).filter((e) => e.id === made.id);
    expect({ ...after, createdAt: 0 }).toEqual({ ...before, createdAt: 0 });
  });

  it("Undo of a rename is refused with the reason when another exercise took the old name since", async () => {
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    const made = succeeded(await addCustomExerciseAction({ ...input, name: "Old Name" })).exercise;
    succeeded(await updateCustomExerciseAction({ ...input, id: made.id, name: "New Name" }));
    succeeded(await addCustomExerciseAction({ ...input, name: "old name" })); // takes the freed name
    expect(await updateCustomExerciseAction({ ...input, id: made.id, name: "Old Name" })).toEqual({ success: false, error: '"old name" already exists.' });
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
    expect(await addCustomExerciseAction({ ...input, name: "Not Theirs" })).toEqual({ success: false, error: "This exercise could not be saved." });
    expect(await addCustomExerciseAction(input)).toEqual({ success: false, error: "This exercise could not be saved." });
    expect(await customRows(userB)).toEqual([]);
    expect((await customRows(userA)).find((r) => r.id === input.id)).toMatchObject({ name: "Twice Row", user_id: userA });
  });

  it("compares names with inner spaces, case and a trailing period ignored, and names the exercise that has it", async () => {
    await getExercises(userA); // seeds the defaults
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    const made = succeeded(await addCustomExerciseAction({ ...input, name: "Bench press" })).exercise;
    const other = succeeded(await addCustomExerciseAction({ ...input, name: "Floor press" })).exercise;
    for (const name of ["Bench  press", "bench press.", "BENCH PRESS"]) {
      expect(await addCustomExerciseAction({ ...input, name })).toEqual({ success: false, error: '"Bench press" already exists.' });
      expect(await updateCustomExerciseAction({ ...input, id: other.id, name })).toEqual({ success: false, error: '"Bench press" already exists.' });
    }
    expect(await addCustomExerciseAction({ ...input, name: "flat  BARBELL bench press." })).toEqual({ success: false, error: '"Flat barbell bench press" already exists.' });
    expect(succeeded(await updateCustomExerciseAction({ ...input, id: made.id, name: "BENCH  press." })).exercise.name).toBe("BENCH  press."); // its own name
    expect((await getExercises(userA)).filter((e) => e.isCustom).map((e) => e.name).sort()).toEqual(["BENCH  press.", "Floor press"]);
  });

  it("takes an exercise name of up to 120 characters and a day name of up to 100", async () => {
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    const made = succeeded(await addCustomExerciseAction({ ...input, name: "a".repeat(120) })).exercise;
    expect(made.name).toHaveLength(120);
    expect(await addCustomExerciseAction({ ...input, name: "b".repeat(121) })).toEqual({ success: false, error: "Too long (max 120)" });
    expect(await updateCustomExerciseAction({ ...input, id: made.id, name: "c".repeat(121) })).toEqual({ success: false, error: "Too long (max 120)" });
    const day = (await getUserSplitWithDays(userA))!.days[0];
    expect((await saveSplitDayAction({ id: day.id, name: "d".repeat(100), isRest: true, exercises: [] })).success).toBe(true);
    expect(await saveSplitDayAction({ id: day.id, name: "d".repeat(101), isRest: true, exercises: [] })).toEqual({ success: false, error: "Too long (max 100)" });
  });

  it("answers an edit or delete of an exercise that is gone with that message", async () => {
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    const made = succeeded(await addCustomExerciseAction({ ...input, name: "Short Lived" })).exercise;
    succeeded(await deleteCustomExerciseAction(made.id));
    const gone = { success: false, error: "This exercise no longer exists." };
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
      expect(await deleteCustomExerciseAction(ex.id)).toEqual({ success: false, error: "This exercise is used by a routine or a workout, so it stays." });
      expect(await exists(ex.id)).toBe(true);
      expect((await dayNow(day.id)).exercises.map((e) => e.exerciseId)).toContain(ex.id);
    });

    it("delete first: the save is refused with a clear message and the day is left as it was", async () => {
      const { day, ex, save } = await setup();
      succeeded(await deleteCustomExerciseAction(ex.id));
      expect(await saveSplitDayAction(save)).toEqual({ success: false, error: "An exercise on this day no longer exists. Remove it and save again." });
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
    expect((await startSessionAction({ date: addDays(TODAY, -5), isDeload: false })).success).toBe(false);
    expect((await startSessionAction({ date: addDays(TODAY, 5), isDeload: false })).success).toBe(false);
  });

  it("refuses a custom exercise whose name exists, ignoring case, among the defaults and the user's own", async () => {
    await getExercises(userA); // seeds the defaults
    const input = { muscleGroup: "chest", equipmentType: "barbell" } as const;
    expect((await addCustomExerciseAction({ ...input, name: "incline BARBELL press" })).success).toBe(false);
    expect((await addCustomExerciseAction({ ...input, name: "My Press" })).success).toBe(true);
    const again = await addCustomExerciseAction({ ...input, name: "my press" });
    expect(again).toMatchObject({ success: false, error: expect.stringContaining("already exists") });
    // Another user may use the same name
    authState.id = userB;
    expect((await addCustomExerciseAction({ ...input, name: "My Press" })).success).toBe(true);
  });

  it("two custom exercises with one name made at once: exactly one is created", async () => {
    const input = { name: "Race Curl", muscleGroup: "biceps", equipmentType: "dumbbell" } as const;
    const results = await Promise.all([addCustomExerciseAction(input), addCustomExerciseAction({ ...input, name: "race curl" })]);
    expect(results.map((r) => r.success).sort()).toEqual([false, true]);
  });

  it("a repeated Finish keeps the first duration", async () => {
    const session = await addWorkoutSession(userA, { date: TODAY, isDeload: false });
    await finishSessionAction({ sessionId: session.id, durationMinutes: 50 });
    const again = await finishSessionAction({ sessionId: session.id, durationMinutes: 70 });
    expect(again).toMatchObject({ success: true, session: { durationMinutes: 50 } });
  });

  it("answers a Finish without minutes with a message, not an exception", async () => {
    const session = await addWorkoutSession(userA, { date: TODAY, isDeload: false });
    expect((await finishSessionAction({ sessionId: session.id })).success).toBe(false);
  });

  it("prevents cross-user session access and set manipulation", async () => {
    const exercisesList = await getExercises(userA);
    const press = exercisesList.find((e) => e.name === "Incline barbell press")!;

    const sessionA = await addWorkoutSession(userA, {
      date: "2026-10-29",
      isDeload: false,
    });

    const setA = await logWorkoutSet(userA, {
      sessionId: sessionA.id,
      exerciseId: press.id,
      setOrder: 1,
      reps: 8,
      loadType: "kg",
      loadValue: 40,
      extraKg: 0,
      isFailure: true,
      isPartial: false,
      isGoodForm: true,
      flagAnomaly: false,
    });

    // User B tries to view User A's session details -> null
    const detailsForB = await getWorkoutSessionDetails(userB, sessionA.id);
    expect(detailsForB).toBeNull();

    // User B tries to log a set into User A's session -> rejected
    await expect(
      logWorkoutSet(userB, {
        sessionId: sessionA.id,
        exerciseId: press.id,
        setOrder: 2,
        reps: 5,
        loadType: "kg",
        loadValue: 40,
        extraKg: 0,
        isFailure: true,
        isPartial: false,
        isGoodForm: true,
        flagAnomaly: false,
      }),
    ).rejects.toThrow("Workout session not found or unauthorized");

    // User B tries to delete User A's set -> does nothing / returns undefined
    const deletedByB = await deleteWorkoutSet(userB, setA.id);
    expect(deletedByB).toBeUndefined();

    // User A can view and delete their own set
    const detailsForA = await getWorkoutSessionDetails(userA, sessionA.id);
    expect(detailsForA?.sets).toHaveLength(1);

    const deletedByA = await deleteWorkoutSet(userA, setA.id);
    expect(deletedByA?.id).toBe(setA.id);
  });

  it("refuses another user's split day or custom exercise when creating a workout or logging a set", async () => {
    const dayA = (await getUserSplitWithDays(userA))!.days[0].id;
    const custom = await addCustomExercise(userA, { name: "Secret lift", muscleGroup: "chest", equipmentType: "barbell" });
    const sessionB = await addWorkoutSession(userB, { date: "2026-10-29", isDeload: false });

    await expect(addWorkoutSession(userB, { date: "2026-10-29", isDeload: false, splitDayId: dayA })).rejects.toThrow(
      "Split day not found or unauthorized",
    );
    await expect(
      logWorkoutSet(userB, {
        sessionId: sessionB.id,
        exerciseId: custom.id,
        setOrder: 1,
        reps: 5,
        loadType: "kg",
        loadValue: 10,
        extraKg: 0,
        isFailure: true,
        isPartial: false,
        isGoodForm: true,
        flagAnomaly: false,
      }),
    ).rejects.toThrow("Exercise not found or unauthorized");
  });

  it("answers a malformed set id with a validation error, not a database error", async () => {
    expect(await deleteSetAction("not-a-uuid")).toEqual({ success: false, error: "Invalid id" });
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
    const first = await done(await addWorkoutSession(userA, { date: weeksAgo(3), isDeload: false }));
    expect(await status()).toEqual([4, 5, false, false]);
    await admin.query("UPDATE workout_sessions SET date = $2 WHERE id = $1", [first.id, weeksAgo(4)]);
    expect(await status()).toEqual([5, 5, false, false]);
    await admin.query("UPDATE workout_sessions SET date = $2 WHERE id = $1", [first.id, weeksAgo(5)]);
    expect(await status()).toEqual([5, 5, true, false]);
    await admin.query("UPDATE workout_sessions SET date = $2 WHERE id = $1", [first.id, weeksAgo(12)]);
    expect(await status()).toEqual([5, 5, true, false]);

    // A deload session alone does not make its week a deload week
    await done(await addWorkoutSession(userA, { date: toISODate(), isDeload: true }));
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
      await done(await addWorkoutSession(userA, { date: addDays(at(-6), 2), isDeload: false })),
      await done(await addWorkoutSession(userA, { date: addDays(at(-1), 2), isDeload: true })),
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
    expect((await restoreDeloadWeeksAction(undo)).success).toBe(true);
    expect(await weeksOf(userA)).toEqual(before);
    expect((await restoreDeloadWeeksAction(undo)).success).toBe(true);
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
    expect((await restoreDeloadWeeksAction({ add: cleared.removed, remove: cleared.added })).success).toBe(true);
    expect(await weeksOf(userA)).toEqual(before);

    // An earlier week as Last: added, and the later past week still stands as the last one
    const earlier = succeeded(await saveDeloadWeeksAction({ last: at(-5), next: at(2) }));
    expect(earlier).toEqual({ success: true, last: at(-3), added: [at(-5)], removed: [at(0)] });
    expect(await weeksOf(userA)).toEqual([at(-8), at(-5), at(-3), at(2)]);
    expect((await restoreDeloadWeeksAction({ add: earlier.removed, remove: earlier.added })).success).toBe(true);
    expect(await weeksOf(userA)).toEqual(before);
  });

  it("restores deload weeks for the owner only: another user's call changes only their own weeks, anonymous is refused", async () => {
    const thisWeek = weekStart(toISODate());
    await saveDeloadWeeksAction({ last: thisWeek, next: null });
    const before = await weeksOf(userA);

    authState.id = userB;
    expect((await restoreDeloadWeeksAction({ add: [addDays(thisWeek, 7)], remove: [thisWeek] })).success).toBe(true);
    expect(await weeksOf(userA)).toEqual(before);
    expect(await weeksOf(userB)).toEqual([addDays(thisWeek, 7)]);

    authState.id = "";
    expect(await restoreDeloadWeeksAction({ add: [addDays(thisWeek, 14)], remove: [thisWeek] })).toEqual({ success: false, error: SIGNED_OUT });
    expect(await weeksOf(userA)).toEqual(before);

    authState.id = userA;
    expect((await restoreDeloadWeeksAction({ add: [], remove: [thisWeek] })).success).toBe(true);
    expect(await weeksOf(userA)).toEqual([]);
  });

  it("refuses a deload week that does not start on a Sunday or a next deload that is not after the last", async () => {
    const thisWeek = weekStart(toISODate());
    for (const weeks of [
      { last: addDays(thisWeek, 1), next: null },
      { last: addDays(thisWeek, 7), next: thisWeek },
      { last: thisWeek, next: thisWeek },
    ]) {
      expect(await saveDeloadWeeksAction(weeks)).toMatchObject({ success: false, error: expect.any(String) });
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
    expect(await saveDeloadWeeksAction({ last: sunday, next: null })).toEqual({ success: false, error: SIGNED_OUT });
    expect((await getDeloadStatus(userA)).lastDeloadWeek).toBe(sunday);
  });

  describe("Server Actions authorization & validation guards", () => {
    it("rejects unauthenticated requests", async () => {
      authState.id = ""; // Unauthenticated
      expect(await startSessionAction({ date: TODAY, isDeload: false })).toEqual({ success: false, error: SIGNED_OUT });

      expect(
        await logSetAction({ sessionId: randomUUID(), exerciseId: randomUUID(), setOrder: 1, reps: 5, loadType: "kg", loadValue: 50 }),
      ).toEqual({ success: false, error: SIGNED_OUT });

      expect(await deleteSetAction(randomUUID())).toEqual({ success: false, error: SIGNED_OUT });
    });

    it("every other action refuses an anonymous caller", async () => {
      authState.id = "";
      const id = randomUUID();
      const denied = async (run: Promise<unknown>) => expect(await run).toEqual({ success: false, error: SIGNED_OUT });
      await denied(finishSessionAction({ sessionId: id, durationMinutes: 30 }));
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
      expect((await restoreSessionAction({ date: addDays(TODAY, -30), isDeload: false, sets: [] })).success).toBe(false);
      const taken = await addWorkoutSession(userA, { date: addDays(TODAY, -10), isDeload: false });
      const have = await logWorkoutSet(userA, { sessionId: taken.id, ...set });
      // The same set id again: a normal "could not restore", not a database error
      expect((await restoreSessionAction({ date: TODAY, isDeload: false, sets: [{ ...set, id: have.id }] })).success).toBe(false);
    });

    it("executes server actions successfully for authenticated owner", async () => {
      authState.id = userA;

      const exercisesList = await getExercises(userA);
      const exercise = exercisesList[0];

      // 1. Start session
      const startRes = succeeded(
        await startSessionAction({
          date: TODAY,
          isDeload: false,
          notes: "Chest day action test",
        }),
      );
      expect(startRes.session.id).toBeDefined();

      // 2. Log set
      const logRes = succeeded(
        await logSetAction({
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

      // 3. Finish session
      const finishRes = succeeded(
        await finishSessionAction({
          sessionId: startRes.session.id,
          durationMinutes: 55,
        }),
      );
      expect(finishRes.session.durationMinutes).toBe(55);

      // 4. Delete set
      const deleteRes = await deleteSetAction(logRes.set.id);
      expect(deleteRes.success).toBe(true);
    });
  });
  describe("cancelSessionAction and the open workout", () => {
    async function startWithSet(userId: string) {
      authState.id = userId;
      const [exercise] = await getExercises(userId);
      const { session } = (await startSessionAction({ date: TODAY, isDeload: false })) as { session: { id: string } };
      await logSetAction({ sessionId: session.id, exerciseId: exercise.id, setOrder: 1, reps: 8, loadType: "kg", loadValue: 40 });
      return session.id;
    }

    it("lets the owner cancel a workout, sets included", async () => {
      const id = await startWithSet(userA);
      expect((await cancelSessionAction({ sessionId: id })).success).toBe(true);
      expect(await getWorkoutSessionDetails(userA, id)).toBeNull();
      const left = await admin.query("SELECT 1 FROM workout_sets WHERE session_id = $1", [id]);
      expect(left.rowCount).toBe(0);
    });

    it("denies another user and anonymous", async () => {
      const id = await startWithSet(userA);
      authState.id = userB;
      expect((await cancelSessionAction({ sessionId: id })).success).toBe(false);
      expect(await cancelWorkoutSession(userB, id)).toBeUndefined();
      authState.id = "";
      expect(await cancelSessionAction({ sessionId: id })).toEqual({ success: false, error: SIGNED_OUT });
      expect(await getWorkoutSessionDetails(userA, id)).not.toBeNull();
    });

    it("rejects a malformed id", async () => {
      expect(await cancelSessionAction({ sessionId: "nope" })).toEqual({ success: false, error: "Invalid id" });
    });

    it("finds only the owner's unfinished recent workout", async () => {
      const id = await startWithSet(userA);
      const open = await getOpenWorkoutSession(userA);
      expect(open?.session.id).toBe(id);
      expect(open?.sets).toHaveLength(1);
      expect(await getOpenWorkoutSession(userB)).toBeNull();
      await finishSessionAction({ sessionId: id, durationMinutes: 50 });
      expect(await getOpenWorkoutSession(userA)).toBeNull();
    });
  });
  describe("Undo of Finish and Cancel, and the workout History", () => {
    async function finished(userId: string, date: string, minutes: number | null) {
      authState.id = userId;
      const [exercise] = await getExercises(userId);
      const session = await addWorkoutSession(userId, { date, isDeload: false });
      await logSetAction({ sessionId: session.id, exerciseId: exercise.id, setOrder: 1, reps: 8, loadType: "kg", loadValue: 40 });
      if (minutes) await finishSessionAction({ sessionId: session.id, durationMinutes: minutes });
      return { id: session.id, exerciseId: exercise.id };
    }

    it("finishes a workout for the owner only", async () => {
      const { id } = await finished(userA, TODAY, null);
      authState.id = userB;
      expect((await finishSessionAction({ sessionId: id, durationMinutes: 40 })).success).toBe(false);
      authState.id = "";
      expect(await finishSessionAction({ sessionId: id, durationMinutes: 40 })).toEqual({ success: false, error: SIGNED_OUT });
      authState.id = userA;
      expect(await finishSessionAction({ sessionId: id, durationMinutes: 40 })).toMatchObject({ success: true, session: { durationMinutes: 40 } });
    });

    it("reopens a finished workout for the owner only", async () => {
      const { id } = await finished(userA, TODAY, 50);
      authState.id = userB;
      expect((await reopenSessionAction({ sessionId: id })).success).toBe(false);
      authState.id = "";
      expect(await reopenSessionAction({ sessionId: id })).toEqual({ success: false, error: SIGNED_OUT });
      expect(await getOpenWorkoutSession(userA)).toBeNull(); // still finished
      authState.id = userA;
      expect((await reopenSessionAction({ sessionId: id })).success).toBe(true);
      expect((await getOpenWorkoutSession(userA))?.session.id).toBe(id);
    });

    it("keeps one open workout: an old one still counts, and Undo of Finish or Cancel cannot make a second", async () => {
      const old = await finished(userA, addDays(TODAY, -30), null); // left open a month ago: still the open one
      expect((await getOpenWorkoutSession(userA))?.session.id).toBe(old.id);
      expect((await startSessionAction({ date: TODAY, isDeload: false })).success).toBe(false);
      await finishSessionAction({ sessionId: old.id, durationMinutes: 45 });
      const started = await startSessionAction({ date: TODAY, isDeload: false });
      expect(started.success).toBe(true);
      expect(await reopenSessionAction({ sessionId: old.id })).toMatchObject({ success: false, error: "A workout is already open. Resume or finish it first." });
      expect(await getOpenWorkoutSession(userA)).toMatchObject({ session: { id: started.success ? started.session.id : "" } });
      expect(await restoreSessionAction({ date: TODAY, isDeload: false, sets: [] })).toMatchObject({ success: false });
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
      expect(await restoreSessionAction(input)).toEqual({ success: false, error: SIGNED_OUT });
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
      expect((await restoreSessionAction(input)).success).toBe(false);
      authState.id = userB;
      expect((await restoreSessionAction({ ...input, sets: [] })).success).toBe(false);
      expect((await getWorkoutSessionDetails(userA, id))?.sets).toHaveLength(1);
    });

    it("restores a deleted set under its own id and time, and an id that is taken writes nothing", async () => {
      const { id, exerciseId } = await finished(userA, TODAY, null);
      const set = (await getWorkoutSessionDetails(userA, id))!.sets[0];
      await deleteSetAction(set.id);
      const input = { id: set.id, createdAt: set.createdAt, sessionId: id, exerciseId, setOrder: 1, reps: 8, loadType: "kg" as const, loadValue: 40 };
      const res = succeeded(await logSetAction(input));
      expect(res.set.id).toBe(set.id);
      expect(res.set.createdAt).toEqual(set.createdAt);
      expect((await logSetAction(input)).success).toBe(false); // already there
      authState.id = userB;
      await expect(logSetAction(input)).rejects.toThrow(); // not their workout
    });

    it("Undo of Finish clears the duration and keeps the notes", async () => {
      const { id } = await finished(userA, TODAY, null);
      await finishSessionAction({ sessionId: id, durationMinutes: 50, notes: "felt strong" });
      expect((await getWorkoutSessionDetails(userA, id))?.session.notes).toBe("felt strong");
      await reopenSessionAction({ sessionId: id });
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
      const custom = await addCustomExercise(userA, { name: "Secret lift", muscleGroup: "chest", equipmentType: "barbell" });
      const res = await restoreSessionAction({
        date: TODAY,
        isDeload: false,
        sets: [{ exerciseId: custom.id, setOrder: 1, reps: 5, loadType: "kg", loadValue: 10, extraKg: 0, isFailure: true, isPartial: false, isGoodForm: true, flagAnomaly: false }],
      });
      expect(res.success).toBe(false);
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

    it("keeps the best of each day and skips deload", () => {
      const sets = [set("2026-11-02", 40, 8), set("2026-11-02", 50, 5), set("2026-11-09", 100, 1, { isDeload: true })];
      expect(exerciseSeries(sets, "e1")).toEqual([{ date: "2026-11-02", weight: 50 }]);
    });

    it("skips only the deload session's sets, not the rest of its week", () => {
      const sets = [
        set("2026-11-02", 50, 8),
        set("2026-11-09", 30, 8, { isDeload: true }), // the deload session
        set("2026-11-12", 45, 8), // a normal session in the same week still counts
        set("2026-11-16", 55, 8),
      ];
      expect(exerciseSeries(sets, "e1").map((p) => p.date)).toEqual(["2026-11-02", "2026-11-12", "2026-11-16"]);
    });

    it("counts a deload week in the day figures like any other week", () => {
      const sets = [set("2026-11-02", 100, 10), set("2026-11-09", 60, 10, { isDeload: true }), set("2026-11-16", 110, 10)];
      const weeks = dayProgress(sets, "d");
      expect(weeks.map((w) => w.week)).toEqual(["2026-11-01", "2026-11-08", "2026-11-15"]);
      expect(weeks.map((w) => w.change)).toEqual([null, -40, 50]);
    });

    it("gives each past workout its week's kg change against the week before, none for a first week or a session with no day", () => {
      const sets = [
        set("2026-11-02", 100, 10),
        set("2026-11-09", 60, 10, { isDeload: true }),
        set("2026-11-16", 110, 10),
      ];
      const session = (date: string, over: Partial<HistorySession> = {}): HistorySession => ({
        id: date, date, dayId: "d", dayName: "Push", durationMinutes: 50, isDeload: false, exercises: [], ...over,
      });
      const [first, deload, third, noDay] = withProgress(
        [session("2026-11-02"), session("2026-11-09", { isDeload: true }), session("2026-11-16"), session("2026-11-17", { dayId: null })],
        sets,
      );
      expect(first.progress).toBeNull(); // nothing before it
      expect(deload.progress).toBeCloseTo(-40); // a deload session is compared like any other
      expect(third.progress).toBeCloseTo(50);
      expect(noDay.progress).toBeNull();
      expect(kgDelta(2.5)).toBe("+2.5 kg");
      expect(kgDelta(-1)).toBe("−1 kg");
      expect(kgDelta(0)).toBe("0 kg");
      expect(kgDelta(null)).toBe("—");
    });

    it("never mixes plates and kg: extra kg is not added to plates, the chart follows the latest unit, day progress skips plates", () => {
      expect(setLoad("kg", "40", "2.5")).toBe(42.5);
      expect(setLoad("bodyweight", "0", "10")).toBe(10);
      expect(setLoad("plates", "6", "2.5")).toBe(6);
      const sets = [
        set("2026-11-02", 60, 8), // kg
        set("2026-11-09", 6, 8, { loadType: "plates" }),
        set("2026-11-16", 7, 8, { loadType: "plates" }),
      ];
      expect(exerciseUnit(sets, "e1")).toBe("plates");
      expect(exerciseSeries(sets, "e1")).toEqual([{ date: "2026-11-09", weight: 6 }, { date: "2026-11-16", weight: 7 }]);
      expect(exerciseUnit([], "e1")).toBe("kg");
      // The week-over-week change reads kg only, so 60 kg to 6 plates is no "−54 kg".
      expect(dayProgress(sets, "d").map((w) => w.change)).toEqual([null]);
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
      const [first, second] = dayProgress(sets, "d");
      expect(first).toEqual({ week: "2026-11-01", change: null });
      expect(second.change).toBeCloseTo(5);
      expect(dayProgress(sets, "other")).toEqual([]);
    });
  });
});
