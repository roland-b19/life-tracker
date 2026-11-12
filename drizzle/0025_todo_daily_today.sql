-- A repeating task's order mark now lives in todos.completed_at (it only counts on the day it happened), so the per-day table goes.
-- Keep each task's latest mark, unless a newer one was already written there.
UPDATE "todos" t SET "completed_at" = m."at" FROM (SELECT "todo_id", max("at") AS "at" FROM "todo_day_marks" GROUP BY "todo_id") m WHERE m."todo_id" = t."id" AND t."is_recurring" AND (t."completed_at" IS NULL OR t."completed_at" < m."at");
--> statement-breakpoint
DROP TABLE "todo_day_marks" CASCADE;
