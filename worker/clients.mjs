import { DefaultAzureCredential } from "@azure/identity";
import { QueueClient } from "@azure/storage-queue";
import pg from "pg";

export const need = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

/** The reminder queue, reached with the container's managed identity (AZURE_CLIENT_ID picks the user-assigned one). No keys. */
export const queueClient = () =>
  new QueueClient(`https://${need("QUEUE_ACCOUNT")}.queue.core.windows.net/${need("QUEUE_NAME")}`, new DefaultAzureCredential());

/** Same TLS rule as the app (src/server/db.ts): the server certificate must verify. */
export const dbPool = () => new pg.Pool({ connectionString: need("DATABASE_URL"), max: 2, ssl: { rejectUnauthorized: true } });

/** Runs a job body, closes nothing itself, and turns a failure into a non-zero exit so Container Apps shows the execution as Failed. */
export async function runJob(name, body) {
  try {
    await body();
  } catch (err) {
    console.error(`${name} failed: ${err instanceof Error ? err.message : "unknown error"}`);
    process.exitCode = 1;
  }
}
