/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

async function main() {
  const adminPassword = process.env.DB_ADMIN_PASSWORD;
  // The app role's password is the one in the app's own DATABASE_URL, so the two can never drift apart.
  const dbUserPassword = process.env.DB_APP_PASSWORD || decodeURIComponent(new URL(process.env.DATABASE_URL || "postgres://invalid").password);
  if (!adminPassword || !dbUserPassword) throw new Error("DB_ADMIN_PASSWORD and DATABASE_URL (with the app password) are required.");
  const sqlPassword = dbUserPassword.replaceAll("'", "''");
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
    CREATE TABLE IF NOT EXISTS "exercises" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid,
      "name" varchar(120) NOT NULL,
      "muscle_group" varchar(50) NOT NULL,
      "equipment_type" varchar(30) NOT NULL,
      "is_custom" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "workout_splits" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "name" varchar(100) NOT NULL,
      "is_active" boolean DEFAULT true NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "workout_split_days" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "split_id" uuid NOT NULL,
      "user_id" uuid NOT NULL,
      "day_of_week" integer NOT NULL,
      "name" varchar(100) NOT NULL,
      "is_rest" boolean DEFAULT false NOT NULL,
      "order_index" integer DEFAULT 0 NOT NULL,
      CONSTRAINT "workout_split_days_split_day_unique" UNIQUE("split_id","day_of_week")
    );
    CREATE TABLE IF NOT EXISTS "workout_split_day_exercises" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "split_day_id" uuid NOT NULL,
      "exercise_id" uuid NOT NULL,
      "order_index" integer NOT NULL,
      "target_sets" integer DEFAULT 2 NOT NULL,
      "min_reps" integer DEFAULT 5 NOT NULL,
      "max_reps" integer DEFAULT 8 NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "workout_sessions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL,
      "split_day_id" uuid,
      "date" date NOT NULL,
      "duration_minutes" integer,
      "is_deload" boolean DEFAULT false NOT NULL,
      "notes" varchar(500),
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "workout_sets" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "session_id" uuid NOT NULL,
      "user_id" uuid NOT NULL,
      "exercise_id" uuid NOT NULL,
      "set_order" integer NOT NULL,
      "reps" integer NOT NULL,
      "load_type" varchar(20) NOT NULL,
      "load_value" numeric(6, 2) NOT NULL,
      "extra_kg" numeric(5, 2) DEFAULT '0' NOT NULL,
      "is_failure" boolean DEFAULT true NOT NULL,
      "is_partial" boolean DEFAULT false NOT NULL,
      "is_good_form" boolean DEFAULT true NOT NULL,
      "flag_anomaly" boolean DEFAULT false NOT NULL,
      "anomaly_reason" varchar(50),
      "notes" varchar(255),
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "workout_sets_reps_positive" CHECK ("reps" > 0),
      CONSTRAINT "workout_sets_load_non_negative" CHECK ("load_value" >= 0),
      CONSTRAINT "workout_sets_extra_kg_non_negative" CHECK ("extra_kg" >= 0)
    );
  `);
  console.log("Verified Gym tables.");

  await appDbClient.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'weight_entries_user_id_users_id_fk'
      ) THEN
        ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_user_id_users_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      END IF;
      -- the gym tables are created without foreign keys above; without them deleting a session leaves its sets behind
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_sets_session_id_workout_sessions_id_fk') THEN
        ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_session_id_workout_sessions_id_fk"
          FOREIGN KEY ("session_id") REFERENCES "workout_sessions"("id") ON DELETE cascade;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_sets_user_id_users_id_fk') THEN
        ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_user_id_users_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_sets_exercise_id_exercises_id_fk') THEN
        ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_exercise_id_exercises_id_fk"
          FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE cascade;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_sessions_user_id_users_id_fk') THEN
        ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
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
    CREATE TABLE IF NOT EXISTS "nutrition_targets" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "calories" integer DEFAULT 3350 NOT NULL,
      "protein_grams" integer DEFAULT 170 NOT NULL,
      "carbs_grams" integer DEFAULT 300 NOT NULL,
      "fat_grams" integer DEFAULT 80 NOT NULL,
      "water_ml" integer DEFAULT 3000 NOT NULL,
      "steps" integer DEFAULT 10000 NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "nutrition_targets_user_unique" UNIQUE("user_id")
    );
    CREATE TABLE IF NOT EXISTS "daily_metrics" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "date" date NOT NULL,
      "water_ml" integer DEFAULT 0 NOT NULL,
      "steps" integer DEFAULT 0 NOT NULL,
      "notes" varchar(255),
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "daily_metrics_user_date_unique" UNIQUE("user_id","date")
    );
    CREATE TABLE IF NOT EXISTS "meals" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "date" date NOT NULL,
      "name" varchar(120) NOT NULL,
      "calories" integer DEFAULT 0 NOT NULL,
      "protein" numeric(5, 1) DEFAULT '0' NOT NULL,
      "carbs" numeric(5, 1) DEFAULT '0' NOT NULL,
      "fat" numeric(5, 1) DEFAULT '0' NOT NULL,
      "is_estimated" boolean DEFAULT false NOT NULL,
      "forgotten" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "meals" ADD COLUMN IF NOT EXISTS "forgotten" boolean DEFAULT false NOT NULL;
    CREATE TABLE IF NOT EXISTS "recipes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "name" varchar(120) NOT NULL,
      "description" varchar(500),
      "calories" integer DEFAULT 0 NOT NULL,
      "protein" numeric(5, 1) DEFAULT '0' NOT NULL,
      "carbs" numeric(5, 1) DEFAULT '0' NOT NULL,
      "fat" numeric(5, 1) DEFAULT '0' NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "recipe_ingredients" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "recipeId" uuid NOT NULL REFERENCES "recipes"("id") ON DELETE cascade,
      "name" varchar(120) NOT NULL,
      "amount" numeric(6, 2) DEFAULT '1' NOT NULL,
      "unit" varchar(30) DEFAULT 'g' NOT NULL,
      "category" varchar(50) DEFAULT 'pantry' NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "shopping_items" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "name" varchar(120) NOT NULL,
      "amount" numeric(6, 2) DEFAULT '1' NOT NULL,
      "unit" varchar(30) DEFAULT 'pcs' NOT NULL,
      "category" varchar(50) DEFAULT 'other' NOT NULL,
      "is_bought" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "cleared_at" timestamp with time zone
    );
    CREATE TABLE IF NOT EXISTS "shopping_categories" (
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "name" varchar(50) NOT NULL,
      "sort_order" integer DEFAULT 0 NOT NULL,
      CONSTRAINT "shopping_categories_user_id_name_pk" PRIMARY KEY("user_id","name")
    );
    CREATE TABLE IF NOT EXISTS "shopping_units" (
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "name" varchar(30) NOT NULL,
      "sort_order" integer DEFAULT 0 NOT NULL,
      CONSTRAINT "shopping_units_user_id_name_pk" PRIMARY KEY("user_id","name")
    );
    CREATE TABLE IF NOT EXISTS "item_categories" (
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "scope" varchar(20) NOT NULL,
      "name" varchar(50) NOT NULL,
      "sort_order" integer DEFAULT 0 NOT NULL,
      CONSTRAINT "item_categories_user_id_scope_name_pk" PRIMARY KEY("user_id","scope","name")
    );
    CREATE TABLE IF NOT EXISTS "todos" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "space" varchar(20) DEFAULT 'personal' NOT NULL,
      "title" varchar(150) NOT NULL,
      "is_recurring" boolean DEFAULT false NOT NULL,
      "recurrence_pattern" varchar(20) DEFAULT 'none' NOT NULL,
      "due_date" date NOT NULL,
      "reminder_time" varchar(10),
      "is_completed" boolean DEFAULT false NOT NULL,
      "completed_at" timestamp with time zone,
      "is_carried_over" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "shopping_items" ADD COLUMN IF NOT EXISTS "checked_at" timestamp with time zone;
    ALTER TABLE "workout_sets" ADD COLUMN IF NOT EXISTS "is_good_form" boolean DEFAULT true NOT NULL;
    UPDATE "exercises" SET "muscle_group" = 'back' WHERE "muscle_group" IN ('lats', 'upper-back', 'lower-back');
    UPDATE "exercises" SET "muscle_group" = 'obliques' WHERE "muscle_group" = 'abs';
    ALTER TABLE "todos" ADD COLUMN IF NOT EXISTS "category" varchar(50) DEFAULT 'other' NOT NULL;
    ALTER TABLE "todos" ADD COLUMN IF NOT EXISTS "placed_at" timestamp with time zone DEFAULT now() NOT NULL;
    CREATE TABLE IF NOT EXISTS "push_subscriptions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "endpoint" varchar(500) NOT NULL,
      "p256dh_key" varchar(255) NOT NULL,
      "auth_key" varchar(255) NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "wishlist_items" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "name" varchar(120) NOT NULL,
      "url" varchar(500),
      "estimated_price" numeric(10, 2) NOT NULL,
      "priority" varchar(10) DEFAULT 'medium' NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "wishlist_price_positive" CHECK ("wishlist_items"."estimated_price" > 0)
    );
    ALTER TABLE "wishlist_items" ADD COLUMN IF NOT EXISTS "category" varchar(50) DEFAULT 'other' NOT NULL;
    CREATE TABLE IF NOT EXISTS "claude_connections" (
      "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "token_encrypted" varchar(1024) NOT NULL,
      "connected_at" timestamp with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "meals_user_date_idx" ON "meals" USING btree ("user_id","date");
    CREATE INDEX IF NOT EXISTS "shopping_items_user_idx" ON "shopping_items" USING btree ("user_id");
    CREATE INDEX IF NOT EXISTS "todos_user_space_due_idx" ON "todos" USING btree ("user_id","space","due_date");
    CREATE INDEX IF NOT EXISTS "workout_sessions_user_date_idx" ON "workout_sessions" USING btree ("user_id","date");
    CREATE INDEX IF NOT EXISTS "workout_sets_session_idx" ON "workout_sets" USING btree ("session_id");
    CREATE INDEX IF NOT EXISTS "workout_sets_user_idx" ON "workout_sets" USING btree ("user_id");
  `);
  console.log("Verified Food, Todo, AI & Wishlist tables.");

  await appDbClient.query(`
    GRANT USAGE ON SCHEMA public TO life_tracker_app;
    GRANT SELECT, INSERT ON TABLE "users" TO life_tracker_app;
    GRANT UPDATE (subject) ON TABLE "users" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "weight_entries" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "exercises" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workout_splits" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workout_split_days" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workout_split_day_exercises" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workout_sessions" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workout_sets" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "nutrition_targets" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "daily_metrics" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "meals" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "recipes" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "recipe_ingredients" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "shopping_items" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "shopping_categories" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "shopping_units" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "item_categories" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "todos" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "push_subscriptions" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "wishlist_items" TO life_tracker_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "claude_connections" TO life_tracker_app;
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
