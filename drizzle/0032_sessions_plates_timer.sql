CREATE TABLE "exercise_plate_weights" (
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"kg" numeric(6, 2) NOT NULL,
	CONSTRAINT "exercise_plate_weights_user_id_exercise_id_pk" PRIMARY KEY("user_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "timer_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "timer_running_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exercise_plate_weights" ADD CONSTRAINT "exercise_plate_weights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_plate_weights" ADD CONSTRAINT "exercise_plate_weights_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "exercise_plate_weights" TO life_tracker_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_sessions" TO life_tracker_app;
