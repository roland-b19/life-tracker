import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth", async () => (await import("./auth")).authModule);
import { authState, seedUser } from "./auth";
import { db } from "@/server/db";
import { claudeConnections, deloadWeeks, pushSubscriptions, weightEntries, wishlistItems, workoutSessions } from "@/db/schema";
import { exportDataAction } from "@/app/actions/export";
import { succeeded } from "./succeeded";
import { createTodo } from "@/lib/todos";

describe("Export: all of the signed-in user's data as text", () => {
  let owner: string;
  let other: string;
  const marker = `private-${randomUUID()}`; // random at run time, so the secret scanner has nothing to flag

  beforeAll(async () => {
    owner = await seedUser(`export-owner-${randomUUID()}`);
    other = await seedUser(`export-other-${randomUUID()}`);
    await db.insert(wishlistItems).values({ userId: owner, name: "Owner Standing Desk", estimatedPrice: "640" });
    await db.insert(wishlistItems).values({ userId: other, name: "Other Secret Gadget", estimatedPrice: "99" });
    await db.insert(weightEntries).values({ userId: owner, date: "2026-11-10", kilograms: "81.5" });
    await db.insert(weightEntries).values({ userId: owner, date: "2019-03-02", kilograms: "90.0" }); // years old: nothing is ever dropped
    await db.insert(workoutSessions).values({ userId: owner, date: "2020-01-05", notes: "felt strong" });
    await db.insert(deloadWeeks).values({ userId: owner, weekStart: "2026-09-07" });
    await createTodo(owner, { space: "personal", title: "Owner Task", isRecurring: false, recurrencePattern: "none", dueDate: "2026-11-12" });
    await createTodo(other, { space: "personal", title: "Other Task", isRecurring: false, recurrencePattern: "none", dueDate: "2026-11-12" });
    await db.insert(claudeConnections).values({ userId: owner, tokenEncrypted: `token-${marker}` });
    await db
      .insert(pushSubscriptions)
      .values({ userId: owner, endpoint: `https://push.example/${marker}`, p256dhKey: `p-${marker}`, authKey: `a-${marker}` });
  });

  it("returns the owner's data as a dated .txt file", async () => {
    authState.id = owner;
    const { filename, text } = succeeded(await exportDataAction());
    expect(filename).toMatch(/^life-tracker-export-\d{4}-\d{2}-\d{2}\.txt$/);
    expect(text).toContain("== Wishlist (1) ==");
    expect(text).toContain("name: Owner Standing Desk");
    expect(text).toContain("== Weight (2) ==");
    expect(text).toContain("day: 2019-03-02 | kilograms: 90");
    expect(text).toContain("workout notes: felt strong");
    expect(text).toContain("day: 2026-11-10 | kilograms: 81.5");
    expect(text).toContain("title: Owner Task");
    expect(text).toContain("week of: 2026-09-07");
  });

  it("never includes another user's data", async () => {
    authState.id = owner;
    const { text } = succeeded(await exportDataAction());
    expect(text).not.toContain("Other Secret Gadget");
    expect(text).not.toContain("Other Task");
    authState.id = other;
    const theirs = succeeded(await exportDataAction());
    expect(theirs.text).toContain("Other Secret Gadget");
    expect(theirs.text).not.toContain("Owner Standing Desk");
  });

  it("leaves out the Claude token and the push subscriptions", async () => {
    authState.id = owner;
    const { text } = succeeded(await exportDataAction());
    expect(text).not.toContain(marker);
  });

  it("rejects an anonymous caller", async () => {
    authState.id = "";
    await expect(exportDataAction()).rejects.toBeInstanceOf(authState.UnauthorizedError);
  });
});
