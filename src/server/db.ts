import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const globalForDb = globalThis as unknown as { pool?: Pool };
const pool =
  globalForDb.pool ??
  new Pool({
    connectionString,
    // Serverless hosts set DB_POOL_MAX=1 or 2: every function instance has its own pool.
    max: Number(process.env.DB_POOL_MAX) || 5,
    // Neon suspends idle computes; a short idle timeout drops connections before the server cuts them.
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS) || 10_000,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
  });

// An idle client the server closed must not crash the process; the pool opens a new one on the next query.
pool.on("error", (err) => console.error("db pool error:", err.message));

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export const db = drizzle(pool);
