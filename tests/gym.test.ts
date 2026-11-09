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

import { dayProgress, exerciseSeries, weekStart } from "@/lib/gym-progress";
import type { HistorySet } from "@/lib/gym";
import { db } from "@/server/db";
import { users } from "@/db/schema";
import {
  cancelWorkoutSession,
  createCustomExercise,
  createWorkoutSession,
  deleteWorkoutSet,
  getDeloadStatus,
  getExerciseContext,
  getExercises,
  getOpenWorkoutSession,
  getUserSplitWithDays,
  getWorkoutSessionDetails,
  logWorkoutSet,
} from "@/lib/gym";
import {
  cancelSessionAction,
  deleteSetAction,
  finishSessionAction,
  getExerciseContextAction,
  getGymHistoryAction,
  logSetAction,
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

  it("suggests progressive overload when user hits top of rep range in previous session", async () => {
    const exercisesList = await getExercises(userA);
    const press = exercisesList.find((e) => e.name === "Incline barbell press")!;

    // Session 1: Hit 8 reps (top of 5-8 range)
    const session1 = await createWorkoutSession(userA, {
      date: "2026-10-22",
      isDeload: false,
      notes: "Felt strong today",
    });

    await logWorkoutSet(userA, {
      sessionId: session1.id,
      exerciseId: press.id,
      setOrder: 1,
      reps: 8,
      loadType: "kg",
      loadValue: 40,
      extraKg: 0,
      isFailure: true,
      isPartial: false,
      flagAnomaly: false,
      notes: "Smooth lockout",
    });

    // Session 2: Next week
    const session2 = await createWorkoutSession(userA, {
      date: "2026-10-29",
      isDeload: false,
    });

    const context = await getExerciseContext(userA, press.id, session2.id, 8);
    expect(context.previousSets).toHaveLength(1);
    expect(context.previousSets[0].reps).toBe(8);
    expect(context.lastNote).toBe("Smooth lockout");
    expect(context.suggestIncrease).toBe(true);
    expect(context.pr?.loadValue).toBe("40.00");
  });

  it("excludes deload sessions from Personal Records (PRs)", async () => {
    const exercisesList = await getExercises(userA);
    const press = exercisesList.find((e) => e.name === "Incline barbell press")!;

    // Regular session: 40 kg
    const normalSession = await createWorkoutSession(userA, {
      date: "2026-10-15",
      isDeload: false,
    });
    await logWorkoutSet(userA, {
      sessionId: normalSession.id,
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

    // Deload session with test weight: should NOT count as PR per spec
    const deloadSession = await createWorkoutSession(userA, {
      date: "2026-10-22",
      isDeload: true,
    });
    await logWorkoutSet(userA, {
      sessionId: deloadSession.id,
      exerciseId: press.id,
      setOrder: 1,
      reps: 10,
      loadType: "kg",
      loadValue: 70, // Higher load during deload
      extraKg: 0,
      isFailure: false,
      isPartial: false,
      flagAnomaly: false,
    });

    const context = await getExerciseContext(userA, press.id);
    expect(context.pr?.loadValue).toBe("40.00");
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

      // 3. Exercise context
      const contextRes = await getExerciseContextAction(exercise.id);
      expect(contextRes.success).toBe(true);

      // 4. Finish session
      const finishRes = await finishSessionAction({
        sessionId: startRes.session.id,
        durationMinutes: 55,
      });
      expect(finishRes.success).toBe(true);
      expect(finishRes.session?.durationMinutes).toBe(55);

      // 5. Delete set
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
  describe("getGymHistoryAction (Progress view)", () => {
    it("returns the owner's sets only, and denies anonymous", async () => {
      authState.id = userA;
      const [exercise] = await getExercises(userA);
      const { session } = await startSessionAction({ date: "2026-11-03", isDeload: false });
      await logSetAction({ sessionId: session.id, exerciseId: exercise.id, setOrder: 1, reps: 8, loadType: "kg", loadValue: 40 });

      const own = await getGymHistoryAction();
      expect(own.sets).toHaveLength(1);
      expect(own.sets[0]).toMatchObject({ date: "2026-11-03", reps: 8, load: 40 });

      authState.id = userB;
      expect((await getGymHistoryAction()).sets).toHaveLength(0);
      authState.id = "";
      await expect(getGymHistoryAction()).rejects.toThrow("Authentication required.");
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
      expect(exerciseSeries(sets, "e1")).toEqual([{ date: "2026-11-02", weight: 50, reps: 8 }]);
    });

    it("averages week-over-week change across exercises", () => {
      const sets = [
        set("2026-11-02", 100, 10, { exerciseId: "e1" }),
        set("2026-11-09", 110, 10, { exerciseId: "e1" }), // +10% weight, 0% reps
        set("2026-11-02", 50, 10, { exerciseId: "e2" }),
        set("2026-11-09", 50, 12, { exerciseId: "e2" }), // 0% weight, +20% reps
        set("2026-11-09", 30, 8, { exerciseId: "e3" }), // no previous week: not counted
      ];
      const [first, second] = dayProgress(sets, "d");
      expect(first).toEqual({ week: "2026-11-02", weight: null, reps: null });
      expect(second.weight).toBeCloseTo(5);
      expect(second.reps).toBeCloseTo(10);
      expect(dayProgress(sets, "other")).toEqual([]);
    });
  });
});
