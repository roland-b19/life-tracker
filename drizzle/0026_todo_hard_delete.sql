-- Tasks are deleted for good and a repeating task is only done for today (is_completed + completed_at), so the tick history,
-- the end day and the streak go. The per-day counts the charts read stay in todo_day_stats.
-- Keep today's ticks of repeating tasks.
UPDATE "todos" t SET "is_completed" = true WHERE t."is_recurring" AND EXISTS (SELECT 1 FROM "todo_completions" c WHERE c."todo_id" = t."id" AND c."date" = (now() AT TIME ZONE 'Europe/Bucharest')::date);
--> statement-breakpoint
-- Repeating tasks that were deleted but kept their days: delete them now.
DELETE FROM "todos" WHERE "ended_on" IS NOT NULL;
--> statement-breakpoint
DROP TABLE "todo_completions" CASCADE;--> statement-breakpoint
ALTER TABLE "todos" DROP COLUMN "ended_on";
--> statement-breakpoint
-- Weekday patterns (days:1,3,5) were removed from the app long ago; every repeating task is daily, and Undo of a delete needs a pattern the app accepts.
UPDATE "todos" SET "recurrence_pattern" = 'daily' WHERE "is_recurring" AND "recurrence_pattern" <> 'daily';
