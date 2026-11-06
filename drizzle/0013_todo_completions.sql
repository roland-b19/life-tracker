CREATE TABLE "todo_completions" (
	"todo_id" uuid NOT NULL,
	"date" date NOT NULL,
	CONSTRAINT "todo_completions_todo_id_date_pk" PRIMARY KEY("todo_id","date")
);
--> statement-breakpoint
ALTER TABLE "todo_completions" ADD CONSTRAINT "todo_completions_todo_id_todos_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill: each repeating task's current run, the streak's due days ending on its last tick.
INSERT INTO "todo_completions" ("todo_id", "date")
SELECT "id", "d" FROM (
	SELECT t."id", g.d::date AS "d", t."streak",
		row_number() OVER (PARTITION BY t."id" ORDER BY g.d DESC) AS "rn"
	FROM "todos" t
	CROSS JOIN LATERAL generate_series(t."last_completed_date" - 7 * greatest(t."streak", 1), t."last_completed_date", interval '1 day') AS g(d)
	WHERE t."is_recurring" AND t."last_completed_date" IS NOT NULL
		AND (t."recurrence_pattern" NOT LIKE 'days:%' OR position(extract(isodow FROM g.d)::text IN t."recurrence_pattern") > 0)
) runs
WHERE "rn" <= greatest("streak", 1);--> statement-breakpoint
ALTER TABLE "todos" DROP COLUMN "streak";--> statement-breakpoint
ALTER TABLE "todos" DROP COLUMN "last_completed_date";--> statement-breakpoint
-- Least privilege: the app ticks (insert) and unticks (delete), never updates.
GRANT SELECT, INSERT, DELETE ON TABLE "todo_completions" TO life_tracker_app;
