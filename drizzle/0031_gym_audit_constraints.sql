-- Each unique index or constraint below fails if the data already holds a duplicate. Check first; every query must return no rows:
--   SELECT user_id, lower(name), count(*) FROM exercises WHERE user_id IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1;
--   SELECT user_id, count(*) FROM workout_sessions WHERE duration_minutes IS NULL GROUP BY 1 HAVING count(*) > 1;
--   SELECT split_day_id, exercise_id, count(*) FROM workout_split_day_exercises GROUP BY 1, 2 HAVING count(*) > 1;
-- The app works before and after this migration: it already refuses each duplicate in code.
CREATE UNIQUE INDEX "exercises_user_name_uniq" ON "exercises" USING btree ("user_id",lower("name")) WHERE "exercises"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_one_open_uniq" ON "workout_sessions" USING btree ("user_id") WHERE "workout_sessions"."duration_minutes" is null;--> statement-breakpoint
CREATE INDEX "workout_sets_user_exercise_idx" ON "workout_sets" USING btree ("user_id","exercise_id","created_at");--> statement-breakpoint
ALTER TABLE "workout_split_day_exercises" ADD CONSTRAINT "workout_split_day_exercises_day_exercise_unique" UNIQUE("split_day_id","exercise_id");