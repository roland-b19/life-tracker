CREATE TABLE "todo_day_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"space" varchar(20) NOT NULL,
	"is_recurring" boolean NOT NULL,
	"date" date NOT NULL,
	"total" integer NOT NULL,
	"done" integer NOT NULL,
	CONSTRAINT "todo_day_stats_unique" UNIQUE("user_id","space","is_recurring","date"),
	CONSTRAINT "todo_day_stats_range" CHECK ("todo_day_stats"."done" >= 0 AND "todo_day_stats"."done" <= "todo_day_stats"."total")
);
--> statement-breakpoint
ALTER TABLE "todo_day_stats" ADD CONSTRAINT "todo_day_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "todo_day_stats" TO life_tracker_app;
