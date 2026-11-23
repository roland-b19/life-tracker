import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", async () => (await import("./auth")).authModule);
import { authState, seedUser } from "./auth";
import { refused, succeeded } from "./succeeded";

import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { exercisePlateWeights, weightEntries } from "@/db/schema";
import { deleteWeightAction, restoreWeightAction, saveWeightAction } from "@/actions/food";
import { savePlateWeightAction } from "@/actions/gym";
import { listWeightEntries } from "@/lib/food";
import { FUTURE_DATE, TWO_DECIMALS } from "@/lib/validations/common";
import { addDays, toISODate } from "@/lib/format-date";
import { addCustomExercise, EXERCISE_GONE, getExercises, getPlateWeights } from "@/lib/gym";
import { SIGNED_OUT } from "@/lib/validations/result";
import { WEIGHT_ENTRY_GONE } from "@/lib/validations/food";
import { securityHeaders } from "@/../next.config";
import { resetDb } from "./db";

const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

describe("weight authorization", () => {
  it("keeps every API route in the authorization test table", () => {
    const routes = import.meta.glob("../app/api/**/route.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const routeFiles = Object.keys(routes)
      .map((file) => file.slice("../app/api/".length))
      .sort();
    // `health` is public on purpose: it answers {status:"ok"} and reads no data (tests/health.test.ts).
    expect(routeFiles).toEqual([
      "auth/[...nextauth]/route.ts",
      "health/route.ts",
    ]);
  });

  it("defines the security headers", () => {
    const names = new Set(securityHeaders.map((header) => header.key));
    expect(names).toEqual(
      new Set([
        "Content-Security-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "X-Frame-Options",
      ]),
    );
  });

  beforeAll(async () => {
    await resetDb(admin);
  });

  beforeEach(async () => {
    await resetDb(admin);
    authState.id = await seedUser(`a-${randomUUID()}`);
  });

  afterAll(async () => {
    await admin.end();
  });

  it("allows the owner and answers anonymous callers with the signed-out error", async () => {
    const ownerId = authState.id;
    const today = toISODate();
    const saved = succeeded(await saveWeightAction({ date: today, kilograms: 80 }));
    expect(saved).toMatchObject({ previous: null, entry: { date: today, kilograms: "80.00" } });

    authState.id = "";
    const signedOut = refused(SIGNED_OUT);
    expect(await saveWeightAction({ date: today, kilograms: 81 })).toEqual(signedOut);
    expect(await deleteWeightAction(saved.entry.id)).toEqual(signedOut);
    expect(await restoreWeightAction({ id: randomUUID(), date: addDays(today, -1), kilograms: 80 })).toEqual(signedOut);
    expect(await listWeightEntries(ownerId)).toEqual([saved.entry]); // nothing was written or deleted
  });

  it("refuses to save a weigh-in for a past day, and still deletes a past one", async () => {
    const ownerId = authState.id;
    const today = toISODate();
    const yesterday = addDays(today, -1);
    expect(await saveWeightAction({ date: yesterday, kilograms: 80 })).toEqual(refused("Only today can be changed."));
    expect(await listWeightEntries(ownerId)).toEqual([]);

    const [past] = await db.insert(weightEntries).values({ userId: ownerId, date: yesterday, kilograms: "80.00" }).returning();
    // Another user cannot delete it; the owner can.
    authState.id = await seedUser(`d-${randomUUID()}`);
    expect(await deleteWeightAction(past.id)).toEqual(refused(WEIGHT_ENTRY_GONE));
    authState.id = ownerId;
    succeeded(await deleteWeightAction(past.id));
    expect(await listWeightEntries(ownerId)).toEqual([]);
  });

  it("restores a deleted weigh-in as the same row, and never over another user's row", async () => {
    const ownerId = authState.id;
    const today = toISODate();
    const created = succeeded(await saveWeightAction({ date: today, kilograms: 82.4 }));
    const original = await db.select().from(weightEntries).where(eq(weightEntries.id, created.entry.id));
    succeeded(await deleteWeightAction(created.entry.id));
    expect(await db.select().from(weightEntries).where(eq(weightEntries.id, created.entry.id))).toEqual([]);

    succeeded(await restoreWeightAction({ ...created.entry, kilograms: Number(created.entry.kilograms) }));
    expect(await db.select().from(weightEntries).where(eq(weightEntries.id, created.entry.id))).toEqual([
      { ...original[0], createdAt: expect.any(Date) },
    ]);
    expect(await restoreWeightAction({ id: created.entry.id, date: addDays(today, -1), kilograms: 82 })).toEqual(refused("This weight entry could not be restored.")); // the id is taken
    expect(await restoreWeightAction({ id: randomUUID(), date: today, kilograms: 82 })).toEqual(refused("This weight entry could not be restored.")); // the day is taken

    authState.id = await seedUser(`c-${randomUUID()}`);
    expect(await restoreWeightAction({ id: created.entry.id, date: today, kilograms: 90 })).toEqual(refused("This weight entry could not be restored.")); // another user's id cannot be claimed
    authState.id = ownerId;
    expect(await listWeightEntries(ownerId)).toEqual([created.entry]);
  });

  it("refuses a weigh-in under an id another user holds, and writes nothing", async () => {
    const ownerId = authState.id;
    const today = toISODate();
    const created = succeeded(await saveWeightAction({ id: randomUUID(), date: today, kilograms: 81 }));
    expect(created).toMatchObject({ entry: { date: today, kilograms: "81.00" }, previous: null });

    const otherId = await seedUser(`f-${randomUUID()}`);
    authState.id = otherId;
    expect(await saveWeightAction({ id: created.entry.id, date: today, kilograms: 90 })).toEqual(refused("This weight could not be saved."));
    expect(await listWeightEntries(otherId)).toEqual([]);

    authState.id = "";
    expect(await saveWeightAction({ id: created.entry.id, date: today, kilograms: 90 })).toEqual(refused(SIGNED_OUT));
    expect(await listWeightEntries(ownerId)).toEqual([created.entry]);
  });

  it("refuses a taken weigh-in id when today already has a weigh-in, and still saves a fresh id or a replay", async () => {
    const ownerId = authState.id;
    const today = toISODate();
    const otherId = await seedUser(`g-${randomUUID()}`);
    authState.id = otherId;
    const theirs = succeeded(await saveWeightAction({ id: randomUUID(), date: today, kilograms: 70 }));

    authState.id = ownerId;
    const [past] = await db.insert(weightEntries).values({ userId: ownerId, date: addDays(today, -1), kilograms: "80.00" }).returning();
    const mine = succeeded(await saveWeightAction({ id: randomUUID(), date: today, kilograms: 81 }));
    const notSaved = refused("This weight could not be saved.");
    expect(await saveWeightAction({ id: theirs.entry.id, date: today, kilograms: 90 })).toEqual(notSaved);
    expect(await saveWeightAction({ id: past.id, date: today, kilograms: 90 })).toEqual(notSaved); // the owner's other day
    expect(await listWeightEntries(ownerId)).toEqual([mine.entry, { id: past.id, date: past.date, kilograms: "80.00" }]);
    expect(await listWeightEntries(otherId)).toEqual([theirs.entry]);

    // A fresh id is a normal edit of today's row; a replay of the add (the row's own id) answers it unchanged, as a repeat.
    const edited = await saveWeightAction({ id: randomUUID(), date: today, kilograms: 79.5 });
    expect(edited).toEqual({ success: true, entry: { ...mine.entry, kilograms: "79.50" }, previous: mine.entry, repeated: false });
    const replay = await saveWeightAction({ id: mine.entry.id, date: today, kilograms: 81 });
    expect(replay).toEqual({ success: true, entry: { ...mine.entry, kilograms: "79.50" }, previous: null, repeated: true });
    expect(await listWeightEntries(ownerId)).toEqual([{ ...mine.entry, kilograms: "79.50" }, { id: past.id, date: past.date, kilograms: "80.00" }]);
    expect(await listWeightEntries(otherId)).toEqual([theirs.entry]);
  });

  it("does not let another user delete or change a row", async () => {
    const ownerId = authState.id;
    const today = toISODate();
    const created = succeeded(await saveWeightAction({ date: today, kilograms: 81 }));
    const otherId = await seedUser(`b-${randomUUID()}`);
    authState.id = otherId;

    expect(await listWeightEntries(otherId)).toEqual([]);
    expect(await deleteWeightAction(created.entry.id)).toEqual(refused(WEIGHT_ENTRY_GONE));
    // The same day for another user is a different row: the owner's weight stays 81.
    const other = await saveWeightAction({ date: today, kilograms: 99 });
    expect(other).toMatchObject({ success: true, previous: null });

    authState.id = ownerId;
    expect(await listWeightEntries(ownerId)).toEqual([created.entry]);
    succeeded(await deleteWeightAction(created.entry.id));
  });

  it("sets the day's weight instead of adding a second row, and reports what it replaced", async () => {
    const today = toISODate();
    const first = succeeded(await saveWeightAction({ date: today, kilograms: 82 }));
    const second = succeeded(await saveWeightAction({ date: today, kilograms: 79.5 }));
    expect(second.entry.id).toBe(first.entry.id);
    expect(second.previous).toEqual(first.entry);
    expect(await listWeightEntries(authState.id)).toEqual([{ id: first.entry.id, date: today, kilograms: "79.50" }]);
  });

  it("rejects mass assignment, invalid values and a malformed id", async () => {
    const today = toISODate();
    expect(await saveWeightAction({ date: today, kilograms: 82, user_id: randomUUID() })).toEqual(refused("Unexpected field: user_id"));
    for (const date of ["2026-13-45", "2026-02-30"]) {
      expect(await saveWeightAction({ date, kilograms: 82 })).toEqual(refused("Invalid date format (YYYY-MM-DD)"));
    }
    expect(await saveWeightAction({ date: "2999-01-01", kilograms: 82 })).toEqual(refused(FUTURE_DATE));
    for (const kilograms of [19.9, 500.5]) {
      expect(await saveWeightAction({ date: today, kilograms })).toEqual(refused("The weight must be between 20 and 500 kg"));
    }
    expect(await saveWeightAction({ date: today, kilograms: 80.123 })).toEqual(refused(TWO_DECIMALS));
    expect(await saveWeightAction({ date: today, kilograms: Number.NaN })).toEqual(refused("Please enter a valid weight"));
    expect(await deleteWeightAction("abc")).toEqual(refused("Invalid id"));
    expect(await restoreWeightAction({ id: "abc", date: "2026-01-03", kilograms: 82 })).toEqual(refused("Invalid id"));
    expect(await listWeightEntries(authState.id)).toEqual([]);
  });
});

describe("plate weight authorization (GYMC-05)", () => {
  const custom = async (userId: string) =>
    (await addCustomExercise(userId, { name: `Plate lift ${randomUUID()}`, muscleGroup: "chest", equipmentType: "machine" }))!.id;
  const rowsOf = (exerciseId: string) =>
    db.select({ userId: exercisePlateWeights.userId, kg: exercisePlateWeights.kg }).from(exercisePlateWeights).where(eq(exercisePlateWeights.exerciseId, exerciseId));

  it("lets the owner set a shared or own exercise's plate weight, and undo it", async () => {
    const owner = (authState.id = await seedUser(`p-${randomUUID()}`));
    const shared = (await getExercises(owner)).find((e) => e.userId === null)!.id;
    const own = await custom(owner);
    expect(await savePlateWeightAction({ exerciseId: shared, kg: 10 })).toEqual({ success: true, previous: null });
    expect(await savePlateWeightAction({ exerciseId: shared, kg: 12.5 })).toEqual({ success: true, previous: 10 });
    expect(await savePlateWeightAction({ exerciseId: own, kg: 5 })).toEqual({ success: true, previous: null });
    expect(await getPlateWeights(owner)).toEqual({ [shared]: 12.5, [own]: 5 });
    // Undo of a first save: none before, so the row goes.
    expect(await savePlateWeightAction({ exerciseId: own, kg: null })).toEqual({ success: true, previous: 5 });
    expect(await getPlateWeights(owner)).toEqual({ [shared]: 12.5 });
  });

  it("refuses another user's custom exercise and leaves its plate weight unchanged", async () => {
    const other = (authState.id = await seedUser(`q-${randomUUID()}`));
    const theirs = await custom(other);
    succeeded(await savePlateWeightAction({ exerciseId: theirs, kg: 20 }));
    authState.id = await seedUser(`r-${randomUUID()}`);
    expect(await savePlateWeightAction({ exerciseId: theirs, kg: 99 })).toEqual(refused(EXERCISE_GONE));
    expect(await savePlateWeightAction({ exerciseId: theirs, kg: null })).toEqual(refused(EXERCISE_GONE));
    expect(await rowsOf(theirs)).toEqual([{ userId: other, kg: "20.00" }]);
  });

  it("refuses a signed-out caller and writes nothing", async () => {
    const owner = await seedUser(`s-${randomUUID()}`);
    const shared = (await getExercises(owner)).find((e) => e.userId === null)!.id;
    authState.id = "";
    expect(await savePlateWeightAction({ exerciseId: shared, kg: 10 })).toEqual(refused(SIGNED_OUT));
    expect(await getPlateWeights(owner)).toEqual({});
  });
});
