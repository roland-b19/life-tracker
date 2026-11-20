import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", async () => (await import("./auth")).authModule);
import { authState, seedUser } from "./auth";

import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { weightEntries } from "@/db/schema";
import { deleteWeightAction, restoreWeightAction, saveWeightAction } from "@/actions/food";
import { listWeightEntries } from "@/lib/food";
import { addDays, toISODate } from "@/lib/format-date";
import { SIGNED_OUT } from "@/lib/validations/result";
import { readdirSync } from "node:fs";
import path from "node:path";
import { securityHeaders } from "@/../next.config";

const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

describe("weight authorization", () => {
  it("keeps every API route in the authorization test table", () => {
    const routeFiles = readdirSync(path.resolve("app/api"), { recursive: true })
      .map(String)
      .filter((file) => file.endsWith("route.ts"))
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
    await admin.query("TRUNCATE TABLE weight_entries, users CASCADE");
  });

  beforeEach(async () => {
    await admin.query("TRUNCATE TABLE weight_entries, users CASCADE");
    authState.id = await seedUser(`a-${randomUUID()}`);
  });

  afterAll(async () => {
    await admin.end();
  });

  it("allows the owner and answers anonymous callers with the signed-out error", async () => {
    const ownerId = authState.id;
    const today = toISODate();
    const saved = await saveWeightAction({ date: today, kilograms: 80 });
    expect(saved).toMatchObject({ success: true, previous: null, entry: { date: today, kilograms: "80.00" } });
    if (!saved.success) throw new Error("save failed");

    authState.id = "";
    const signedOut = { success: false, error: SIGNED_OUT };
    expect(await saveWeightAction({ date: today, kilograms: 81 })).toEqual(signedOut);
    expect(await deleteWeightAction(saved.entry.id)).toEqual(signedOut);
    expect(await restoreWeightAction({ id: randomUUID(), date: addDays(today, -1), kilograms: 80 })).toEqual(signedOut);
    expect(await listWeightEntries(ownerId)).toEqual([saved.entry]); // nothing was written or deleted
  });

  it("refuses to save a weigh-in for a past day, and still deletes a past one", async () => {
    const ownerId = authState.id;
    const today = toISODate();
    const yesterday = addDays(today, -1);
    expect(await saveWeightAction({ date: yesterday, kilograms: 80 })).toEqual({ success: false, error: "Only today can be changed." });
    expect(await listWeightEntries(ownerId)).toEqual([]);

    const [past] = await db.insert(weightEntries).values({ userId: ownerId, date: yesterday, kilograms: "80.00" }).returning();
    // Another user cannot delete it; the owner can.
    authState.id = await seedUser(`d-${randomUUID()}`);
    expect((await deleteWeightAction(past.id)).success).toBe(false);
    authState.id = ownerId;
    expect((await deleteWeightAction(past.id)).success).toBe(true);
    expect(await listWeightEntries(ownerId)).toEqual([]);
  });

  it("restores a deleted weigh-in as the same row, and never over another user's row", async () => {
    const ownerId = authState.id;
    const today = toISODate();
    const created = await saveWeightAction({ date: today, kilograms: 82.4 });
    if (!created.success) throw new Error("save failed");
    const original = await db.select().from(weightEntries).where(eq(weightEntries.id, created.entry.id));
    expect((await deleteWeightAction(created.entry.id)).success).toBe(true);
    expect(await db.select().from(weightEntries).where(eq(weightEntries.id, created.entry.id))).toEqual([]);

    const restored = await restoreWeightAction({ ...created.entry, kilograms: Number(created.entry.kilograms) });
    expect(restored.success).toBe(true);
    expect(await db.select().from(weightEntries).where(eq(weightEntries.id, created.entry.id))).toEqual([
      { ...original[0], createdAt: expect.any(Date) },
    ]);
    expect((await restoreWeightAction({ id: created.entry.id, date: addDays(today, -1), kilograms: 82 })).success).toBe(false); // the id is taken
    expect((await restoreWeightAction({ id: randomUUID(), date: today, kilograms: 82 })).success).toBe(false); // the day is taken

    authState.id = await seedUser(`c-${randomUUID()}`);
    expect((await restoreWeightAction({ id: created.entry.id, date: today, kilograms: 90 })).success).toBe(false); // another user's id cannot be claimed
    authState.id = ownerId;
    expect(await listWeightEntries(ownerId)).toEqual([created.entry]);
  });

  it("refuses a weigh-in under an id another user holds, and writes nothing", async () => {
    const ownerId = authState.id;
    const today = toISODate();
    const created = await saveWeightAction({ id: randomUUID(), date: today, kilograms: 81 });
    if (!created.success) throw new Error("save failed");
    expect(created).toMatchObject({ entry: { date: today, kilograms: "81.00" }, previous: null });

    const otherId = await seedUser(`f-${randomUUID()}`);
    authState.id = otherId;
    expect(await saveWeightAction({ id: created.entry.id, date: today, kilograms: 90 })).toEqual({
      success: false,
      error: "This weight could not be saved.",
    });
    expect(await listWeightEntries(otherId)).toEqual([]);

    authState.id = "";
    expect(await saveWeightAction({ id: created.entry.id, date: today, kilograms: 90 })).toEqual({ success: false, error: SIGNED_OUT });
    expect(await listWeightEntries(ownerId)).toEqual([created.entry]);
  });

  it("does not let another user delete or change a row", async () => {
    const ownerId = authState.id;
    const today = toISODate();
    const created = await saveWeightAction({ date: today, kilograms: 81 });
    if (!created.success) throw new Error("save failed");
    const otherId = await seedUser(`b-${randomUUID()}`);
    authState.id = otherId;

    expect(await listWeightEntries(otherId)).toEqual([]);
    expect((await deleteWeightAction(created.entry.id)).success).toBe(false);
    // The same day for another user is a different row: the owner's weight stays 81.
    const other = await saveWeightAction({ date: today, kilograms: 99 });
    expect(other).toMatchObject({ success: true, previous: null });

    authState.id = ownerId;
    expect(await listWeightEntries(ownerId)).toEqual([created.entry]);
    expect((await deleteWeightAction(created.entry.id)).success).toBe(true);
  });

  it("sets the day's weight instead of adding a second row, and reports what it replaced", async () => {
    const today = toISODate();
    const first = await saveWeightAction({ date: today, kilograms: 82 });
    const second = await saveWeightAction({ date: today, kilograms: 79.5 });
    if (!first.success || !second.success) throw new Error("save failed");
    expect(second.entry.id).toBe(first.entry.id);
    expect(second.previous).toEqual(first.entry);
    expect(await listWeightEntries(authState.id)).toEqual([{ id: first.entry.id, date: today, kilograms: "79.50" }]);
  });

  it("rejects mass assignment, invalid values and a malformed id", async () => {
    const refused = (error: string) => ({ success: false, error });
    const today = toISODate();
    expect(await saveWeightAction({ date: today, kilograms: 82, user_id: randomUUID() })).toMatchObject({ success: false, error: expect.stringContaining("user_id") });
    for (const date of ["2026-13-45", "2026-02-30"]) {
      expect(await saveWeightAction({ date, kilograms: 82 })).toEqual(refused("Invalid date format (YYYY-MM-DD)"));
    }
    expect(await saveWeightAction({ date: "2999-01-01", kilograms: 82 })).toEqual(refused("The date cannot be in the future."));
    for (const kilograms of [19.9, 500.5]) {
      expect(await saveWeightAction({ date: today, kilograms })).toEqual(refused("The weight must be between 20 and 500 kg."));
    }
    expect(await saveWeightAction({ date: today, kilograms: 80.123 })).toEqual(refused("Maximum two decimal places."));
    expect(await saveWeightAction({ date: today, kilograms: Number.NaN })).toEqual(refused("Please enter a valid weight."));
    expect(await deleteWeightAction("abc")).toEqual({ success: false, error: "Invalid id" });
    expect(await restoreWeightAction({ id: "abc", date: "2026-01-03", kilograms: 82 })).toEqual({ success: false, error: "Invalid id" });
    expect(await listWeightEntries(authState.id)).toEqual([]);
  });
});
