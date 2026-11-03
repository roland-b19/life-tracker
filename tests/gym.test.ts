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

import { db } from "@/server/db";
import { users } from "@/db/schema";
import {
  createCustomExercise,
  createWorkoutSession,
  deleteWorkoutSet,
  getDeloadStatus,
  getExerciseContext,
  getExercises,
  getUserSplitWithDays,
  getWorkoutSessionDetails,
  logWorkoutSet,
} from "@/lib/gym";
import {
  deleteSetAction,
  finishSessionAction,
  getExerciseContextAction,
  logSetAction,
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
      muscleGroup: "legs",
      equipmentType: "barbell",
    });
    expect(custom.id).toBeDefined();

    const userAExercises = await getExercises(userA);
    expect(userAExercises.some((e) => e.name === "B-Stance Hip Thrust")).toBe(true);

    const userBExercises = await getExercises(userB);
    expect(userBExercises.some((e) => e.name === "B-Stance Hip Thrust")).toBe(false);
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
});
