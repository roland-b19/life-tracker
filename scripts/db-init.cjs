/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

async function main() {
  const adminPassword = process.env.DB_ADMIN_PASSWORD;
  // The app role's password is the one in the app's own DATABASE_URL, so the two can never drift apart.
  const dbUserPassword = process.env.DB_APP_PASSWORD || decodeURIComponent(new URL(process.env.DATABASE_URL || "postgres://invalid").password);
  if (!adminPassword || !dbUserPassword) throw new Error("DB_ADMIN_PASSWORD and DATABASE_URL (with the app password) are required.");
  const sqlPassword = dbUserPassword.replaceAll("'", "''");
  const pgHost = process.env.DB_HOST || "lifetrackerstagepg.postgres.database.azure.com";

  const sslOptions = process.env.DB_SSL === "disable" ? false : { rejectUnauthorized: true }; // shortcut: DB_SSL=disable is for a local test database only
  console.log("Connecting to postgres maintenance db...");
  const adminClient = new Client({
    connectionString: `postgresql://ltadmin:${encodeURIComponent(adminPassword)}@${pgHost}:5432/postgres${process.env.DB_SSL === "disable" ? "" : "?sslmode=require"}`,
    ssl: sslOptions,
  });
  await adminClient.connect();
  console.log("Connected to postgres maintenance DB.");

  const dbCheck = await adminClient.query(
    "SELECT 1 FROM pg_database WHERE datname = 'life_tracker'",
  );
  if (dbCheck.rows.length === 0) {
    await adminClient.query("CREATE DATABASE life_tracker");
    console.log("Created database life_tracker.");
  } else {
    console.log("Database life_tracker already exists.");
  }

  const roleCheck = await adminClient.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'life_tracker_app'",
  );
  if (roleCheck.rows.length === 0) {
    await adminClient.query(
      `CREATE ROLE life_tracker_app WITH LOGIN PASSWORD '${sqlPassword}'`,
    );
    console.log("Created role life_tracker_app.");
  } else {
    await adminClient.query(
      `ALTER ROLE life_tracker_app WITH PASSWORD '${sqlPassword}'`,
    );
    console.log("Updated password for role life_tracker_app.");
  }

  await adminClient.query("GRANT CONNECT ON DATABASE life_tracker TO life_tracker_app");
  await adminClient.end();

  console.log("Connecting to life_tracker db as admin...");
  const appDbClient = new Client({
    connectionString: `postgresql://ltadmin:${encodeURIComponent(adminPassword)}@${pgHost}:5432/life_tracker${process.env.DB_SSL === "disable" ? "" : "?sslmode=require"}`,
    ssl: sslOptions,
  });
  await appDbClient.connect();
  console.log("Connected to life_tracker DB.");

  // The schema comes only from the Drizzle migrations (the same files the personal deploy runs), so it can never drift from the code.
  // Their GRANT statements give life_tracker_app its least-privilege rights; only the schema usage is granted here.
  await appDbClient.query("GRANT USAGE ON SCHEMA public TO life_tracker_app");
  const { drizzle } = require("drizzle-orm/node-postgres");
  const { migrate } = require("drizzle-orm/node-postgres/migrator");
  await migrate(drizzle(appDbClient), { migrationsFolder: process.env.MIGRATIONS_DIR || require("node:path").join(process.cwd(), "drizzle") });
  console.log("Applied Drizzle migrations.");
  await appDbClient.end();

  console.log("Verifying connection as life_tracker_app via DATABASE_URL...");
  const testClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: sslOptions,
  });
  await testClient.connect();
  const testRes = await testClient.query(
    "SELECT current_user, current_database(), count(*) FROM users",
  );
  console.log("APP_DB_VERIFICATION_SUCCESS:", JSON.stringify(testRes.rows[0]));
  await testClient.end();
}

main().catch((err) => {
  console.error("MIGRATION_ERROR:", err);
  process.exit(1);
});
