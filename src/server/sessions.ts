import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { userSessions } from "@/db/schema";

/*
 * One row per signed-in device (D-041): the JWT carries the row's id (`sid`), so signing out deletes only this device's
 * row, and a token whose row is gone stops working. The session check moves `last_seen_at` at most once a day, so a row
 * in use is never more than a day behind; sign-in prunes rows unseen for longer than the token's max age plus that day.
 */

// A token's ids reach SQL only as uuids: anything else cannot name a row (and would make Postgres throw).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Starts this device's session at sign-in, after pruning rows no live token can still name; returns the row's id. */
export async function startSession(userId: string, maxAgeSeconds: number): Promise<string> {
  await db
    .delete(userSessions)
    .where(lt(userSessions.lastSeenAt, sql`now() - make_interval(secs => ${maxAgeSeconds}) - interval '1 day'`));
  const [row] = await db.insert(userSessions).values({ userId }).returning({ id: userSessions.id });
  return row.id;
}

/** Ends one device's session: the row must be this user's too. */
export async function endSession(sid: string, userId: string) {
  if (!UUID.test(sid) || !UUID.test(userId)) return;
  await db.delete(userSessions).where(and(eq(userSessions.id, sid), eq(userSessions.userId, userId)));
}

/**
 * Whether the token's session row still exists for its user, in one query. A row last seen more than a day ago moves
 * `last_seen_at` to now in the same statement, so a token in daily use outlives its row's `created_at`.
 */
export async function isSessionLive(sid: string, userId: string): Promise<boolean> {
  if (!UUID.test(sid) || !UUID.test(userId)) return false;
  const { rows } = await db.execute(sql`
    with touched as (
      update user_sessions set last_seen_at = now()
      where id = ${sid} and user_id = ${userId} and last_seen_at < now() - interval '1 day'
      returning id
    )
    select 1 as live from user_sessions where id = ${sid} and user_id = ${userId}`);
  return rows.length > 0;
}
