/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

async function main() {
  const adminPassword = process.env.DB_ADMIN_PASSWORD;
  const dbUserPassword = process.env.DB_APP_PASSWORD || "foabMTPauBTMlD4cmV0pAa1!";
  const pgHost = process.env.DB_HOST || "lifetrackerstagepg.postgres.database.azure.com";

  console.log("Connecting to postgres maintenance db...");
  const adminClient = new Client({
    connectionString: `postgresql://ltadmin:${encodeURIComponent(adminPassword)}@${pgHost}:5432/postgres?sslmode=require`,
    ssl: { rejectUnauthorized: true },
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
      `CREATE ROLE life_tracker_app WITH LOGIN PASSWORD '${dbUserPassword}'`,
    );
    console.log("Created role life_tracker_app.");
  } else {
    await adminClient.query(
      `ALTER ROLE life_tracker_app WITH PASSWORD '${dbUserPassword}'`,
    );
    console.log("Updated password for role life_tracker_app.");
  }

  await adminClient.query("GRANT CONNECT ON DATABASE life_tracker TO life_tracker_app");
  await adminClient.end();

  console.log("Connecting to life_tracker db as admin...");
  const appDbClient = new Client({
    connectionString: `postgresql://ltadmin:${encodeURIComponent(adminPassword)}@${pgHost}:5432/life_tracker?sslmode=require`,
    ssl: { rejectUnauthorized: true },
  });
  await appDbClient.connect();
  console.log("Connected to life_tracker DB.");

  await appDbClient.query(`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "issuer" varchar(255) NOT NULL,
      "subject" varchar(255) NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "users_issuer_subject_unique" UNIQUE("issuer","subject")
    );
  `);
  console.log("Verified table: users");

  await appDbClient.query(`
    CREATE TABLE IF NOT EXISTS "weight_entries" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "date" date NOT NULL,
      "kilograms" numeric(5, 2) NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "weight_entries_user_date_unique" UNIQUE("user_id","date")
    );
  `);
  console.log("Verified table: weight_entries");

  await appDbClient.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'weight_entries_user_id_users_id_fk'
      ) THEN
        ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_user_id_users_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'weight_entries_kilograms_range'
      ) THEN
        ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_kilograms_range"
          CHECK ("weight_entries"."kilograms" >= 20 AND "weight_entries"."kilograms" <= 500);
      END IF;
    END $$;
  `);
  console.log("Verified constraints.");

  await appDbClient.query(`
    GRANT USAGE ON SCHEMA public TO life_tracker_app;
    GRANT SELECT, INSERT ON TABLE "users" TO life_tracker_app;
    GRANT UPDATE (subject) ON TABLE "users" TO life_tracker_app;
    GRANT SELECT, INSERT, DELETE ON TABLE "weight_entries" TO life_tracker_app;
  `);
  console.log("Granted least-privilege permissions to life_tracker_app.");
  await appDbClient.end();

  console.log("Verifying connection as life_tracker_app via DATABASE_URL...");
  const testClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
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
