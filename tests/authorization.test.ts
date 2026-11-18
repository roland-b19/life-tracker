import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  id: "",
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/server/auth", () => ({
  UnauthorizedError: authState.UnauthorizedError,
  requireUser: vi.fn(async () => {
    if (!authState.id) throw new authState.UnauthorizedError();
    return authState.id;
  }),
}));

import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { users, weightEntries } from "@/db/schema";
import { deleteWeightAction, restoreWeightAction, saveWeightAction } from "@/app/actions/food";
import { listWeightEntries } from "@/lib/food";
import { readdirSync } from "node:fs";
import path from "node:path";
import { securityHeaders } from "@/../next.config";

const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });

async function seedUser(subject: string) {
  const [user] = await db
    .insert(users)
    .values({ issuer: "test", subject })
    .returning({ id: users.id });
  return user.id;
}

describe("weight authorization", () => {
  it("keeps every API route in the authorization test table", () => {
    const routeFiles = readdirSync(path.resolve("app/api"), { recursive: true })
      .map(String)
      .filter((file) => file.endsWith("route.ts"))
      .sort();
    expect(routeFiles).toEqual([
      "auth/[...nextauth]/route.ts",
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

  it("allows the owner and rejects anonymous callers", async () => {
    const ownerId = authState.id;
    const saved = await saveWeightAction({ date: "2026-01-01", kilograms: 80 });
    expect(saved).toMatchObject({ success: true, previous: null, entry: { date: "2026-01-01", kilograms: "80.00" } });

    authState.id = "";
    await expect(saveWeightAction({ date: "2026-01-02", kilograms: 80 })).rejects.toBeInstanceOf(authState.UnauthorizedError);
    await expect(deleteWeightAction(randomUUID())).rejects.toBeInstanceOf(authState.UnauthorizedError);
    await expect(restoreWeightAction({ id: randomUUID(), date: "2026-01-02", kilograms: 80 })).rejects.toBeInstanceOf(
      authState.UnauthorizedError,
    );
    expect(await listWeightEntries(ownerId)).toHaveLength(1); // nothing was written
  });

  it("restores a deleted weigh-in as the same row, and never over another user's row", async () => {
    const ownerId = authState.id;
    const created = await saveWeightAction({ date: "2026-01-03", kilograms: 82.4 });
    if (!created.success) throw new Error("save failed");
    const original = await db.select().from(weightEntries).where(eq(weightEntries.id, created.entry.id));
    expect((await deleteWeightAction(created.entry.id)).success).toBe(true);
    expect(await db.select().from(weightEntries).where(eq(weightEntries.id, created.entry.id))).toEqual([]);

    const restored = await restoreWeightAction({ ...created.entry, kilograms: Number(created.entry.kilograms) });
    expect(restored.success).toBe(true);
    expect(await db.select().from(weightEntries).where(eq(weightEntries.id, created.entry.id))).toEqual([
      { ...original[0], createdAt: expect.any(Date) },
    ]);
    expect((await restoreWeightAction({ id: created.entry.id, date: "2026-01-04", kilograms: 82 })).success).toBe(false); // the id is taken
    expect((await restoreWeightAction({ id: randomUUID(), date: "2026-01-03", kilograms: 82 })).success).toBe(false); // the day is taken

    authState.id = await seedUser(`c-${randomUUID()}`);
    expect((await restoreWeightAction({ id: created.entry.id, date: "2026-01-03", kilograms: 90 })).success).toBe(false); // another user's id cannot be claimed
    authState.id = ownerId;
    expect(await listWeightEntries(ownerId)).toEqual([created.entry]);
  });

  it("does not let another user delete or change a row", async () => {
    const ownerId = authState.id;
    const created = await saveWeightAction({ date: "2026-01-02", kilograms: 81 });
    if (!created.success) throw new Error("save failed");
    const otherId = await seedUser(`b-${randomUUID()}`);
    authState.id = otherId;

    expect(await listWeightEntries(otherId)).toEqual([]);
    expect((await deleteWeightAction(created.entry.id)).success).toBe(false);
    // The same day for another user is a different row: the owner's weight stays 81.
    const other = await saveWeightAction({ date: "2026-01-02", kilograms: 99 });
    expect(other).toMatchObject({ success: true, previous: null });

    authState.id = ownerId;
    expect(await listWeightEntries(ownerId)).toEqual([created.entry]);
    expect((await deleteWeightAction(created.entry.id)).success).toBe(true);
  });

  it("sets the day's weight instead of adding a second row, and reports what it replaced", async () => {
    const first = await saveWeightAction({ date: "2026-01-03", kilograms: 82 });
    const second = await saveWeightAction({ date: "2026-01-03", kilograms: 79.5 });
    if (!first.success || !second.success) throw new Error("save failed");
    expect(second.entry.id).toBe(first.entry.id);
    expect(second.previous).toEqual(first.entry);
    expect(await listWeightEntries(authState.id)).toEqual([{ id: first.entry.id, date: "2026-01-03", kilograms: "79.50" }]);
  });

  it("rejects mass assignment, invalid values and a malformed id", async () => {
    const invalid = { success: false, error: "Please enter a valid weight." };
    expect(await saveWeightAction({ date: "2026-01-03", kilograms: 82, user_id: randomUUID() })).toEqual(invalid);
    for (const date of ["2026-13-45", "2026-02-30", "2999-01-01"]) {
      expect(await saveWeightAction({ date, kilograms: 82 })).toEqual(invalid);
    }
    for (const kilograms of [19.9, 500.5, 80.123, Number.NaN]) {
      expect(await saveWeightAction({ date: "2026-01-03", kilograms })).toEqual(invalid);
    }
    await expect(deleteWeightAction("abc")).rejects.toThrow();
    await expect(restoreWeightAction({ id: "abc", date: "2026-01-03", kilograms: 82 })).rejects.toThrow();
    expect(await listWeightEntries(authState.id)).toEqual([]);
  });
});
