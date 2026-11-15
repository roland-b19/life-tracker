CREATE TABLE "deload_weeks" (
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	CONSTRAINT "deload_weeks_user_id_week_start_pk" PRIMARY KEY("user_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "deload_weeks" ADD CONSTRAINT "deload_weeks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "deload_weeks" TO life_tracker_app;
