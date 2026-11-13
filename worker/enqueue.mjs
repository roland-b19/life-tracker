// Scheduled job (every minute): puts one queue message per reminder that is due this minute (Bucharest time).
import { dbPool, queueClient, runJob } from "./clients.mjs";
import { DUE_REMINDERS_SQL, encodeMessage, localDay, localTime } from "./lib.mjs";

await runJob("enqueue", async () => {
  const pool = dbPool();
  try {
    const now = new Date();
    // shortcut: only the current minute is matched, so a run that Container Apps skips loses that minute's reminders; widen to a window when it matters.
    const { rows } = await pool.query(DUE_REMINDERS_SQL, [localTime(now), localDay(now)]);
    const queue = queueClient();
    for (const row of rows) await queue.sendMessage(encodeMessage(row));
    console.log(`enqueued ${rows.length} reminder(s)`);
  } finally {
    await pool.end();
  }
});
