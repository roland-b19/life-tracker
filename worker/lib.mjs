// Pure helpers of the Azure reminder pipeline. No imports: tests/worker.test.ts loads this file without the worker's own dependencies.

// The same timezone as src/lib/format-date.ts: a reminder "09:00" is Bucharest time, the container runs in UTC.
export const APP_TZ = "Europe/Bucharest";
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "2026-11-13": the calendar day of a moment in the app's timezone. */
export const localDay = (d) => dayFormat.format(d);
/** "09:05": the minute of a moment in the app's timezone (the format of `todos.reminder_time`). */
export const localTime = (d) => timeFormat.format(d);

// $1 = "HH:MM", $2 = "YYYY-MM-DD" (both in the app's timezone). Mirrors src/lib/todos.ts: a one-off task is due on its day
// and, left undone, on every day after it (the page carries it over to today only when it is opened, so the reminder must
// not wait for that); a repeating one every day from its first day; a repeating task counts as done only if it was ticked today.
// Only users with a push subscription: no one else could be reached.
export const DUE_REMINDERS_SQL = `
SELECT t.id AS "todoId", t.user_id AS "userId"
FROM todos t
WHERE t.reminder_time = $1
  AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = t.user_id)
  AND (
    (NOT t.is_recurring AND t.due_date <= $2::date AND NOT t.is_completed)
    OR (
      t.is_recurring AND t.due_date <= $2::date
      AND NOT (t.is_completed AND t.completed_at IS NOT NULL AND (t.completed_at AT TIME ZONE '${APP_TZ}')::date = $2::date)
    )
  )`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The queue message: ids only, never the task title (the consumer reads it from the database). */
export const encodeMessage = ({ todoId, userId }) => JSON.stringify({ todoId, userId });

/** Returns { todoId, userId } or null for anything else (a poison message is dropped, not retried forever). */
export function parseMessage(text) {
  try {
    const m = JSON.parse(text);
    return m && UUID.test(m.todoId) && UUID.test(m.userId) ? { todoId: m.todoId, userId: m.userId } : null;
  } catch {
    return null;
  }
}

/** The web push payload read by public/sw.js (title, body, same-origin url). */
export const buildPayload = (taskTitle) => JSON.stringify({ title: "Reminder", body: taskTitle, url: "/todos" });

/** A push service answers 404 or 410 when the browser dropped the subscription: delete our row. */
const isGoneStatus = (code) => code === 404 || code === 410;

/** A message seen this many times is dropped, so one broken reminder cannot loop forever. */
export const MAX_ATTEMPTS = 5;

/**
 * Sends one reminder to every device of its owner. `query` is pg's (text, params) => { rows }, `sendPush` is web-push's.
 * Returns "skipped" (task gone or not the user's: dropped), "sent", or "retry" (a push service failed: leave the message on the queue).
 * shortcut: a retry also re-sends to the devices that already got it, split per device if duplicates ever show up.
 */
export async function deliverReminder({ query, sendPush }, { todoId, userId }) {
  // The owner is part of the lookup: a forged message with someone else's task id finds nothing.
  const todo = await query("SELECT title FROM todos WHERE id = $1 AND user_id = $2", [todoId, userId]);
  if (todo.rows.length === 0) return "skipped";
  const subs = await query("SELECT id, endpoint, p256dh_key, auth_key FROM push_subscriptions WHERE user_id = $1", [userId]);
  const payload = buildPayload(todo.rows[0].title);
  let retry = false;
  for (const s of subs.rows) {
    try {
      await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } }, payload);
    } catch (err) {
      if (isGoneStatus(err?.statusCode)) await query("DELETE FROM push_subscriptions WHERE id = $1 AND user_id = $2", [s.id, userId]);
      else retry = true;
    }
  }
  return retry ? "retry" : "sent";
}
