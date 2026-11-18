// Scheduled job (every minute): drains the queue, sends each reminder as a web push, then deletes the message.
import * as webpush from "web-push";
import { dbPool, need, queueClient, runJob } from "./clients.mjs";
import { deliverReminder, MAX_ATTEMPTS, parseMessage } from "./lib.mjs";

await runJob("send", async () => {
  webpush.setVapidDetails(need("VAPID_SUBJECT"), need("VAPID_PUBLIC_KEY"), need("VAPID_PRIVATE_KEY"));
  const pool = dbPool();
  const queue = queueClient();
  const deps = { query: (text, params) => pool.query(text, params), sendPush: (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 3600 }) };
  const counts = { sent: 0, skipped: 0, retry: 0 };
  try {
    for (;;) {
      const { receivedMessageItems } = await queue.receiveMessages({ numberOfMessages: 32, visibilityTimeout: 60 });
      if (receivedMessageItems.length === 0) break;
      for (const item of receivedMessageItems) {
        const message = parseMessage(item.messageText);
        const outcome = message ? await deliverReminder(deps, message) : "skipped";
        counts[outcome]++;
        // A failed push stays on the queue (it reappears after the visibility timeout) until it has been tried MAX_ATTEMPTS times.
        if (outcome !== "retry" || item.dequeueCount >= MAX_ATTEMPTS) await queue.deleteMessage(item.messageId, item.popReceipt);
      }
    }
    console.log(`reminders sent ${counts.sent}, dropped ${counts.skipped}, left for retry ${counts.retry}`);
  } finally {
    await pool.end();
  }
});
