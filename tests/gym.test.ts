import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  id: "",
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super("Authentication required.");
      this.name = "UnauthorizedError";
    }
  },
}));

vi.mock("@/server/auth", () => ({
  UnauthorizedError: authState.UnauthorizedError,
  requireUser: vi.fn(async () => {
    if (!authState.id) throw new authState.UnauthorizedError();
    return authState.id;
  }),
}));

import { dayProgress, exerciseSeries, kgDelta, progressSets, weekStart, withProgress } from "@/lib/gym-progress";
import type { HistorySession, HistorySet } from "@/lib/gym";
import { db } from "@/server/db";
import { users } from "@/db/schema";
import {
  cancelWorkoutSession,
  createCustomExercise,
  createWorkoutSession,
  deleteWorkoutSet,
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
  createCustomExerciseAction,
  deleteCustomExerciseAction,
  deleteSetAction,
  finishSessionAction,
  logSetAction,
  reopenSessionAction,
  restoreSessionAction,
  saveSplitDayAction,
  startSessionAction,
} from "@/app/actions/gym";

const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

async function seedUser(subject: string) {
  const [user] = await db
    .insert(users)
    .values({ issuer: "test", subject })
    .returning({ id: users.id });
  return user.id;
}

describe("Gym module: Data Access, Logic & Authorization", () => {
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
    const custom = await createCustomExercise(userA, {
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
      (await createCustomExerciseAction({ name, muscleGroup: "quads", equipmentType: "barbell" })).exercise;
    const fresh = await make("Undo Squat");

    authState.id = userB;
    expect((await deleteCustomExerciseAction(fresh.id)).success).toBe(false);
    expect((await getExercises(userA)).some((e) => e.id === fresh.id)).toBe(true);
    authState.id = "";
    await expect(deleteCustomExerciseAction(fresh.id)).rejects.toThrow("Authentication required.");

    authState.id = userA;
    expect((await deleteCustomExerciseAction(fresh.id)).success).toBe(true);
    expect((await getExercises(userA)).some((e) => e.id === fresh.id)).toBe(false);

    const used = await make("Used Squat");
    const { session } = await startSessionAction({ date: "2026-11-03", isDeload: false });
    await logSetAction({ sessionId: session.id, exerciseId: used.id, setOrder: 1, reps: 5, loadType: "kg", loadValue: 50 });
    expect((await deleteCustomExerciseAction(used.id)).success).toBe(false);
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
      await expect(
        saveSplitDayAction({ id: day.id, name: "X", isRest: true, exercises: [] }),
      ).rejects.toThrow("Authentication required.");
    });

    it("rejects another user's custom exercise", async () => {
      const foreign = await createCustomExercise(userB, {
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
      expect(res.success).toBe(false);
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
      ).rejects.toThrow();
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
      ).rejects.toThrow();
    });
  });

  it("automatically flags '!!' anomaly when reps < minTargetReps", async () => {
    const exercisesList = await getExercises(userA);
    const press = exercisesList.find((e) => e.name === "Incline barbell press")!;

    const session = await createWorkoutSession(userA, {
      date: "2026-10-29",
      isDeload: false,
    });

    // Target is 5-8 reps. User logs 3 reps -> automatic anomaly!
    const set1 = await logWorkoutSet(userA, {
      sessionId: session.id,
      exerciseId: press.id,
      setOrder: 1,
      reps: 3,
      loadType: "kg",
      loadValue: 60,
      extraKg: 0,
      isFailure: true,
      isPartial: false,
      flagAnomaly: false,
      minTargetReps: 5,
      maxTargetReps: 8,
    });

    expect(set1.flagAnomaly).toBe(true);
    expect(set1.anomalyReason).toBe("too_heavy");

    // Normal set with 7 reps within 5-8 target -> not an anomaly
    const set2 = await logWorkoutSet(userA, {
      sessionId: session.id,
      exerciseId: press.id,
      setOrder: 2,
      reps: 7,
      loadType: "kg",
      loadValue: 50,
      extraKg: 0,
      isFailure: true,
      isPartial: false,
      flagAnomaly: false,
      minTargetReps: 5,
      maxTargetReps: 8,
    });

    expect(set2.flagAnomaly).toBe(false);
  });

  it("prevents cross-user session access and set manipulation", async () => {
    const exercisesList = await getExercises(userA);
    const press = exercisesList.find((e) => e.name === "Incline barbell press")!;

    const sessionA = await createWorkoutSession(userA, {
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
    const custom = await createCustomExercise(userA, { name: "Secret lift", muscleGroup: "chest", equipmentType: "barbell" });
    const sessionB = await createWorkoutSession(userB, { date: "2026-10-29", isDeload: false });

    await expect(createWorkoutSession(userB, { date: "2026-10-29", isDeload: false, splitDayId: dayA })).rejects.toThrow(
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
        flagAnomaly: false,
      }),
    ).rejects.toThrow("Exercise not found or unauthorized");
  });

  it("answers a malformed set id with a validation error, not a database error", async () => {
    await expect(deleteSetAction("not-a-uuid")).rejects.toThrow("Invalid id");
  });

  it("tracks 5-week deload cycle and flags when deload is due", async () => {
    // New user with no sessions -> cycle week 1, not due
    const statusNew = await getDeloadStatus(userA);
    expect(statusNew.currentCycleWeek).toBe(1);
    expect(statusNew.isDeloadDue).toBe(false);

    // User logged a deload session 5 weeks ago
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 36); // 36 days = 5 weeks + 1 day
    const pastDateString = pastDate.toISOString().split("T")[0];

    await createWorkoutSession(userA, {
      date: pastDateString,
      isDeload: true,
    });

    const statusDue = await getDeloadStatus(userA);
    expect(statusDue.isDeloadDue).toBe(true);
    expect(statusDue.weeksSinceLastDeload).toBeGreaterThanOrEqual(5);
  });

  describe("Server Actions authorization & validation guards", () => {
    it("rejects unauthenticated requests", async () => {
      authState.id = ""; // Unauthenticated
      await expect(
        startSessionAction({ date: "2026-11-03", isDeload: false }),
      ).rejects.toThrow("Authentication required.");

      await expect(
        logSetAction({
          sessionId: randomUUID(),
          exerciseId: randomUUID(),
          setOrder: 1,
          reps: 5,
          loadType: "kg",
          loadValue: 50,
        }),
      ).rejects.toThrow("Authentication required.");

      await expect(deleteSetAction(randomUUID())).rejects.toThrow(
        "Authentication required.",
      );
    });

    it("executes server actions successfully for authenticated owner", async () => {
      authState.id = userA;

      const exercisesList = await getExercises(userA);
      const exercise = exercisesList[0];

      // 1. Start session
      const startRes = await startSessionAction({
        date: "2026-11-03",
        isDeload: false,
        notes: "Chest day action test",
      });
      expect(startRes.success).toBe(true);
      expect(startRes.session.id).toBeDefined();

      // 2. Log set
      const logRes = await logSetAction({
        sessionId: startRes.session.id,
        exerciseId: exercise.id,
        setOrder: 1,
        reps: 8,
        loadType: "kg",
        loadValue: 42.5,
        extraKg: 0,
        isFailure: true,
        isPartial: false,
        flagAnomaly: false,
      });
      expect(logRes.success).toBe(true);
      expect(logRes.set.reps).toBe(8);

      // 3. Finish session
      const finishRes = await finishSessionAction({
        sessionId: startRes.session.id,
        durationMinutes: 55,
      });
      expect(finishRes.success).toBe(true);
      expect(finishRes.session?.durationMinutes).toBe(55);

      // 4. Delete set
      const deleteRes = await deleteSetAction(logRes.set.id);
      expect(deleteRes.success).toBe(true);
    });
  });
  describe("cancelSessionAction and the open workout", () => {
    async function startWithSet(userId: string) {
      authState.id = userId;
      const [exercise] = await getExercises(userId);
      const { session } = await startSessionAction({ date: "2026-11-03", isDeload: false });
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
      await expect(cancelSessionAction({ sessionId: id })).rejects.toThrow("Authentication required.");
      expect(await getWorkoutSessionDetails(userA, id)).not.toBeNull();
    });

    it("rejects a malformed id", async () => {
      await expect(cancelSessionAction({ sessionId: "nope" })).rejects.toThrow();
    });

    it("finds only the owner's unfinished recent workout", async () => {
      const id = await startWithSet(userA);
      const open = await getOpenWorkoutSession(userA, "2026-11-01");
      expect(open?.session.id).toBe(id);
      expect(open?.sets).toHaveLength(1);
      expect(await getOpenWorkoutSession(userB, "2026-11-01")).toBeNull();
      expect(await getOpenWorkoutSession(userA, "2026-11-04")).toBeNull(); // too old
      await finishSessionAction({ sessionId: id, durationMinutes: 50 });
      expect(await getOpenWorkoutSession(userA, "2026-11-01")).toBeNull();
    });
  });
  describe("Undo of Finish and Cancel, and the workout History", () => {
    async function finished(userId: string, date: string, minutes: number | null) {
      authState.id = userId;
      const [exercise] = await getExercises(userId);
      const { session } = await startSessionAction({ date, isDeload: false });
      await logSetAction({ sessionId: session.id, exerciseId: exercise.id, setOrder: 1, reps: 8, loadType: "kg", loadValue: 40 });
      if (minutes) await finishSessionAction({ sessionId: session.id, durationMinutes: minutes });
      return { id: session.id, exerciseId: exercise.id };
    }

    it("finishes a workout for the owner only", async () => {
      const { id } = await finished(userA, "2026-11-03", null);
      authState.id = userB;
      expect((await finishSessionAction({ sessionId: id, durationMinutes: 40 })).session).toBeUndefined();
      authState.id = "";
      await expect(finishSessionAction({ sessionId: id, durationMinutes: 40 })).rejects.toThrow("Authentication required.");
      authState.id = userA;
      expect((await finishSessionAction({ sessionId: id, durationMinutes: 40 })).session?.durationMinutes).toBe(40);
    });

    it("reopens a finished workout for the owner only", async () => {
      const { id } = await finished(userA, "2026-11-03", 50);
      authState.id = userB;
      expect((await reopenSessionAction({ sessionId: id })).success).toBe(false);
      authState.id = "";
      await expect(reopenSessionAction({ sessionId: id })).rejects.toThrow("Authentication required.");
      expect(await getOpenWorkoutSession(userA, "2026-11-01")).toBeNull(); // still finished
      authState.id = userA;
      expect((await reopenSessionAction({ sessionId: id })).success).toBe(true);
      expect((await getOpenWorkoutSession(userA, "2026-11-01"))?.session.id).toBe(id);
    });

    it("restores a cancelled workout with its sets for the owner, as the caller's own", async () => {
      const { id, exerciseId } = await finished(userA, "2026-11-03", null);
      const input = {
        date: "2026-11-03",
        isDeload: false,
        sets: [{ exerciseId, setOrder: 1, reps: 8, loadType: "kg" as const, loadValue: 40, extraKg: 0, isFailure: true, isPartial: false, flagAnomaly: false }],
      };
      await cancelSessionAction({ sessionId: id });
      const back = await restoreSessionAction(input);
      expect(back.success).toBe(true);
      expect(back.details?.sets).toHaveLength(1);
      expect((await getOpenWorkoutSession(userA, "2026-11-01"))?.session.id).toBe(back.details?.session.id);

      authState.id = userB; // B restores under B: nothing of A's changes, and A's exercise stays out of reach
      const own = await restoreSessionAction({ ...input, sets: [] });
      expect(own.details?.session.userId).toBe(userB);
      authState.id = "";
      await expect(restoreSessionAction(input)).rejects.toThrow("Authentication required.");
    });

    it("brings a cancelled workout back with the same ids and times, and refuses ids that are taken", async () => {
      const { id, exerciseId } = await finished(userA, "2026-11-03", null);
      const before = (await getWorkoutSessionDetails(userA, id))!;
      const set = before.sets[0];
      await cancelSessionAction({ sessionId: id });
      const input = {
        id,
        createdAt: before.session.createdAt,
        date: "2026-11-03",
        isDeload: false,
        sets: [{ id: set.id, createdAt: set.createdAt, exerciseId, setOrder: 1, reps: 8, loadType: "kg" as const, loadValue: 40, extraKg: 0, isFailure: false, isPartial: false, flagAnomaly: false }],
      };
      const back = await restoreSessionAction(input);
      expect(back.details?.session.id).toBe(id);
      expect(back.details?.session.createdAt).toEqual(before.session.createdAt);
      expect(back.details?.sets[0].id).toBe(set.id);
      expect(back.details?.sets[0].createdAt).toEqual(set.createdAt);
      // Restoring twice, or into an id another user holds, writes nothing.
      expect((await restoreSessionAction(input)).success).toBe(false);
      authState.id = userB;
      expect((await restoreSessionAction({ ...input, sets: [] })).success).toBe(false);
      expect((await getWorkoutSessionDetails(userA, id))?.sets).toHaveLength(1);
    });

    it("restores a deleted set under its own id and time, and an id that is taken writes nothing", async () => {
      const { id, exerciseId } = await finished(userA, "2026-11-03", null);
      const set = (await getWorkoutSessionDetails(userA, id))!.sets[0];
      await deleteSetAction(set.id);
      const input = { id: set.id, createdAt: set.createdAt, sessionId: id, exerciseId, setOrder: 1, reps: 8, loadType: "kg" as const, loadValue: 40 };
      const res = await logSetAction(input);
      expect(res.set?.id).toBe(set.id);
      expect(res.set?.createdAt).toEqual(set.createdAt);
      expect((await logSetAction(input)).success).toBe(false); // already there
      authState.id = userB;
      await expect(logSetAction(input)).rejects.toThrow(); // not their workout
    });

    it("Undo of Finish clears the duration and the notes the Finish wrote", async () => {
      const { id } = await finished(userA, "2026-11-03", null);
      await finishSessionAction({ sessionId: id, durationMinutes: 50, notes: "felt strong" });
      expect((await getWorkoutSessionDetails(userA, id))?.session.notes).toBe("felt strong");
      await reopenSessionAction({ sessionId: id });
      const open = (await getWorkoutSessionDetails(userA, id))!.session;
      expect(open.durationMinutes).toBeNull();
      expect(open.notes).toBeNull();
    });

    it("does not link a restored workout to another user's day or exercise", async () => {
      const { exerciseId } = await finished(userA, "2026-11-03", 50);
      const dayA = (await getUserSplitWithDays(userA))!.days[0].id;
      authState.id = userB;
      const withDay = await restoreSessionAction({ date: "2026-11-03", isDeload: false, splitDayId: dayA, sets: [] });
      expect(withDay.details?.session.splitDayId).toBeNull();
      const custom = await createCustomExercise(userA, { name: "Secret lift", muscleGroup: "chest", equipmentType: "barbell" });
      const res = await restoreSessionAction({
        date: "2026-11-03",
        isDeload: false,
        sets: [{ exerciseId: custom.id, setOrder: 1, reps: 5, loadType: "kg", loadValue: 10, extraKg: 0, isFailure: true, isPartial: false, flagAnomaly: false }],
      });
      expect(res.success).toBe(false);
      expect(exerciseId).toBeTruthy();
    });

    it("lists the owner's finished workouts, newest first, and keeps the open one out", async () => {
      await finished(userA, "2026-11-01", 40);
      await finished(userA, "2026-11-03", 55);
      const open = await finished(userA, "2026-11-08", null);
      const list = await getWorkoutHistory(userA, "2026-11-07", "2026-01-01");
      expect(list.map((h) => h.date)).toEqual(["2026-11-03", "2026-11-01"]);
      expect(list[0]).toMatchObject({ durationMinutes: 55, isDeload: false });
      expect(list[0].exercises[0].sets).toEqual([{ reps: 8, loadType: "kg", load: 40 }]);
      expect(list.some((h) => h.id === open.id)).toBe(false);
      expect((await getWorkoutHistory(userA, "2026-11-07", "2026-11-02")).map((h) => h.date)).toEqual(["2026-11-03"]);
      expect(await getWorkoutHistory(userB, "2026-11-07", "2026-01-01")).toEqual([]);
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

    it("finds the Monday of a week", () => {
      expect(weekStart("2026-11-09")).toBe("2026-11-09"); // Monday
      expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sunday
      expect(weekStart("2026-11-08")).toBe("2026-11-02");
    });

    it("keeps the best of each day and skips deload", () => {
      const sets = [set("2026-11-02", 40, 8), set("2026-11-02", 50, 5), set("2026-11-09", 100, 1, { isDeload: true })];
      expect(exerciseSeries(sets, "e1")).toEqual([{ date: "2026-11-02", weight: 50 }]);
    });

    it("skips the whole deload week, whatever day or exercise the deload was", () => {
      const sets = [
        set("2026-11-02", 50, 8),
        set("2026-11-09", 30, 8, { isDeload: true, exerciseId: "e2" }), // deload on Monday, other exercise
        set("2026-11-12", 45, 8), // a normal-looking set in the same week
        set("2026-11-16", 55, 8),
      ];
      expect(exerciseSeries(sets, "e1").map((p) => p.date)).toEqual(["2026-11-02", "2026-11-16"]);
    });

    it("compares the week after a deload with the week before it", () => {
      const sets = [
        set("2026-11-02", 100, 10),
        set("2026-11-09", 60, 10, { isDeload: true }),
        set("2026-11-16", 110, 10), // +10 kg against 2 Nov, not against the deload
      ];
      const weeks = dayProgress(sets, "d");
      expect(weeks.map((w) => w.week)).toEqual(["2026-11-02", "2026-11-16"]); // no deload point
      expect(weeks[1].change).toBeCloseTo(10);
    });

    it("steps over several deload weeks in a row", () => {
      const sets = [
        set("2026-11-02", 100, 10),
        set("2026-11-09", 60, 10, { isDeload: true }),
        set("2026-11-16", 60, 10, { isDeload: true }),
        set("2026-11-23", 120, 10),
      ];
      expect(dayProgress(sets, "d").at(-1)?.change).toBeCloseTo(20);
    });

    it("gives each past workout its week's kg change against the week before, none for a deload or a first week", () => {
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
      expect(deload.progress).toBeNull();
      expect(third.progress).toBeCloseTo(10);
      expect(noDay.progress).toBeNull();
      expect(kgDelta(2.5)).toBe("+2.5 kg");
      expect(kgDelta(-1)).toBe("−1 kg");
      expect(kgDelta(0)).toBe("0 kg");
      expect(kgDelta(null)).toBe("—");
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
      expect(first).toEqual({ week: "2026-11-02", change: null });
      expect(second.change).toBeCloseTo(5);
      expect(dayProgress(sets, "other")).toEqual([]);
    });
  });
});
