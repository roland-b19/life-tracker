CREATE TABLE "todo_day_marks" (
	"todo_id" uuid NOT NULL,
	"date" date NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "todo_day_marks_todo_id_date_pk" PRIMARY KEY("todo_id","date")
);
--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "placed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "todo_day_marks" ADD CONSTRAINT "todo_day_marks_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Existing tasks keep today's order: new ones were placed when created, carried-over ones (which sat on top) on their day.
UPDATE "todos" SET "placed_at" = CASE WHEN "is_carried_over" THEN GREATEST("created_at", "due_date"::timestamp AT TIME ZONE 'UTC') ELSE "created_at" END;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "todo_day_marks" TO life_tracker_app;
