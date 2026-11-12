CREATE TABLE "shopping_units" (
	"user_id" uuid NOT NULL,
	"name" varchar(30) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shopping_units_user_id_name_pk" PRIMARY KEY("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "shopping_units" ADD CONSTRAINT "shopping_units_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "shopping_units" TO life_tracker_app;--> statement-breakpoint
-- Tasks keep no history any more.
DROP TABLE "todo_day_stats" CASCADE;--> statement-breakpoint
-- Health keeps water and steps for the last 7 days and weight for the last 365 (days in Europe/Bucharest, like the app).
DELETE FROM "daily_metrics" WHERE "date" < (now() AT TIME ZONE 'Europe/Bucharest')::date - 6;--> statement-breakpoint
DELETE FROM "weight_entries" WHERE "date" < (now() AT TIME ZONE 'Europe/Bucharest')::date - 364;
