import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { users } from "@/db/schema";
import { createTodo, savePushSubscription } from "@/lib/todos";
import { addDays, toISODate } from "@/lib/format-date";
import {
  buildPayload,
  deliverReminder,
  DUE_REMINDERS_SQL,
  encodeMessage,
  localDay,
  localTime,
  parseMessage,
} from "../worker/lib.mjs";

// The worker connects with the app's own database role, so its queries run through the same role here.
const app = new Pool({ connectionString: process.env.DATABASE_URL });
const admin = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE });
const query = (text: string, params: unknown[]) => app.query(text, params) as Promise<{ rows: Record<string, string>[] }>;

async function seedUser() {
  const [user] = await db.insert(users).values({ issuer: "test", subject: `w-${randomUUID()}` }).returning({ id: users.id });
  return user.id;
}
const subscribe = (userId: string, endpoint = `https://push.example/${randomUUID()}`) =>
  savePushSubscription(userId, { endpoint, p256dhKey: "p256dh", authKey: "auth" });
const task = (userId: string, title: string, extra: { dueDate?: string; reminderTime?: string; isRecurring?: boolean } = {}) =>
  createTodo(userId, {
    space: "personal",
    title,
    dueDate: extra.dueDate ?? toISODate(),
    isRecurring: extra.isRecurring ?? false,
    recurrencePattern: extra.isRecurring ? "daily" : "none",
    reminderTime: extra.reminderTime ?? "09:00",
  });

afterAll(async () => {
  await app.end();
  await admin.end();
});

describe("worker: time in the app's timezone", () => {
  it("reads the Bucharest minute and day, winter and summer, across UTC midnight", () => {
    expect(localTime(new Date("2026-11-13T07:05:00Z"))).toBe("09:05");
    expect(localDay(new Date("2026-11-13T07:05:00Z"))).toBe("2026-11-13");
    expect(localTime(new Date("2026-07-01T06:00:00Z"))).toBe("09:00");
    expect(localTime(new Date("2026-11-13T22:30:00Z"))).toBe("00:30");
    expect(localDay(new Date("2026-11-13T22:30:00Z"))).toBe("2026-11-14");
  });
});

describe("worker: queue messages", () => {
  it("carries ids only and drops anything malformed", () => {
    const todoId = randomUUID();
    const userId = randomUUID();
    const text = encodeMessage({ todoId, userId });
    expect(text).not.toMatch(/title/i);
    expect(parseMessage(text)).toEqual({ todoId, userId });
    expect(parseMessage("not json")).toBeNull();
    expect(parseMessage(JSON.stringify({ todoId: "1", userId }))).toBeNull();
    expect(parseMessage(JSON.stringify({ todoId, userId: `${userId}; DROP TABLE todos` }))).toBeNull();
    expect(parseMessage("null")).toBeNull();
  });

  it("builds a payload the service worker understands, with a same-origin url", () => {
    expect(JSON.parse(buildPayload("Call mum"))).toEqual({ title: "Reminder", body: "Call mum", url: "/todos" });
  });
});

describe("worker: which reminders are due (flag-independent, Azure only)", () => {
  beforeEach(async () => {
    await admin.query("TRUNCATE TABLE todos, push_subscriptions, users CASCADE");
  });
  const due = async (time = "09:00", day = toISODate()) => (await app.query(DUE_REMINDERS_SQL, [time, day])).rows.map((r) => r.todoId);

  it("matches the minute, the day and the open state, and only users who have a device", async () => {
    const user = await seedUser();
    await subscribe(user);
    const open = await task(user, "open");
    await task(user, "other minute", { reminderTime: "09:01" });
    await task(user, "tomorrow", { dueDate: addDays(toISODate(), 1) });
    const done = await task(user, "done");
    await admin.query("UPDATE todos SET is_completed = true WHERE id = $1", [done.id]);

    const noDevice = await seedUser();
    await task(noDevice, "nobody to tell");

    expect(await due()).toEqual([open.id]);
  });

  it("treats a repeating task as open again each day", async () => {
    const user = await seedUser();
    await subscribe(user);
    const tickedToday = await task(user, "ticked today", { isRecurring: true, dueDate: addDays(toISODate(), -3) });
    const tickedYesterday = await task(user, "ticked yesterday", { isRecurring: true, dueDate: addDays(toISODate(), -3) });
    const notStarted = await task(user, "starts tomorrow", { isRecurring: true, dueDate: addDays(toISODate(), 1) });
    await admin.query("UPDATE todos SET is_completed = true, completed_at = now() WHERE id = $1", [tickedToday.id]);
    await admin.query("UPDATE todos SET is_completed = true, completed_at = now() - interval '1 day' WHERE id = $1", [tickedYesterday.id]);

    const found = await due();
    expect(found).toEqual([tickedYesterday.id]);
    expect(found).not.toContain(notStarted.id);
  });
});

describe("worker: delivering a reminder", () => {
  beforeEach(async () => {
    await admin.query("TRUNCATE TABLE todos, push_subscriptions, users CASCADE");
  });

  it("sends the owner's task title to every device of the owner", async () => {
    const user = await seedUser();
    await subscribe(user, "https://push.example/a");
    await subscribe(user, "https://push.example/b");
    const t = await task(user, "Call mum");
    const sendPush = vi.fn(async () => ({}));

    expect(await deliverReminder({ query, sendPush }, { todoId: t.id, userId: user })).toBe("sent");
    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(sendPush.mock.calls.map((c) => (c as unknown[])[1])).toEqual([buildPayload("Call mum"), buildPayload("Call mum")]);
  });

  it("never sends a task to someone who does not own it (forged message)", async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    await subscribe(stranger);
    const t = await task(owner, "private");
    const sendPush = vi.fn(async () => ({}));

    expect(await deliverReminder({ query, sendPush }, { todoId: t.id, userId: stranger })).toBe("skipped");
    expect(await deliverReminder({ query, sendPush }, { todoId: randomUUID(), userId: owner })).toBe("skipped");
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("removes a subscription the push service reports gone and keeps the rest", async () => {
    const user = await seedUser();
    await subscribe(user, "https://push.example/gone");
    await subscribe(user, "https://push.example/alive");
    const t = await task(user, "x");
    const sendPush = vi.fn(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("/gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      return {};
    });

    expect(await deliverReminder({ query, sendPush }, { todoId: t.id, userId: user })).toBe("sent");
    const left = await admin.query("SELECT endpoint FROM push_subscriptions WHERE user_id = $1", [user]);
    expect(left.rows.map((r) => r.endpoint)).toEqual(["https://push.example/alive"]);
  });

  it("asks for a retry on a transient push failure and keeps the subscription", async () => {
    const user = await seedUser();
    await subscribe(user);
    const t = await task(user, "x");
    const sendPush = vi.fn(async () => {
      throw Object.assign(new Error("push service down"), { statusCode: 503 });
    });

    expect(await deliverReminder({ query, sendPush }, { todoId: t.id, userId: user })).toBe("retry");
    expect((await admin.query("SELECT 1 FROM push_subscriptions WHERE user_id = $1", [user])).rows).toHaveLength(1);
  });
});
