CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" varchar(120) NOT NULL,
	"muscle_group" varchar(50) NOT NULL,
	"equipment_type" varchar(30) NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"split_day_id" uuid,
	"date" date NOT NULL,
	"duration_minutes" integer,
	"is_deload" boolean DEFAULT false NOT NULL,
	"notes" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
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
	"flag_anomaly" boolean DEFAULT false NOT NULL,
	"anomaly_reason" varchar(50),
	"notes" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_sets_reps_positive" CHECK ("workout_sets"."reps" > 0),
	CONSTRAINT "workout_sets_load_non_negative" CHECK ("workout_sets"."load_value" >= 0),
	CONSTRAINT "workout_sets_extra_kg_non_negative" CHECK ("workout_sets"."extra_kg" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workout_split_day_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"split_day_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"target_sets" integer DEFAULT 2 NOT NULL,
	"min_reps" integer DEFAULT 5 NOT NULL,
	"max_reps" integer DEFAULT 8 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_split_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"split_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_rest" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "workout_split_days_split_day_unique" UNIQUE("split_id","day_of_week")
);
--> statement-breakpoint
CREATE TABLE "workout_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_split_day_id_workout_split_days_id_fk" FOREIGN KEY ("split_day_id") REFERENCES "public"."workout_split_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_split_day_exercises" ADD CONSTRAINT "workout_split_day_exercises_split_day_id_workout_split_days_id_fk" FOREIGN KEY ("split_day_id") REFERENCES "public"."workout_split_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_split_day_exercises" ADD CONSTRAINT "workout_split_day_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_split_days" ADD CONSTRAINT "workout_split_days_split_id_workout_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."workout_splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_split_days" ADD CONSTRAINT "workout_split_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_splits" ADD CONSTRAINT "workout_splits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "exercises" TO life_tracker_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workout_splits" TO life_tracker_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workout_split_days" TO life_tracker_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workout_split_day_exercises" TO life_tracker_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workout_sessions" TO life_tracker_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workout_sets" TO life_tracker_app;
