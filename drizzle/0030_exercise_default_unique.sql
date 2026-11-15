-- Fails if the shared default exercises already hold a duplicate name. Check first:
--   SELECT name, count(*) FROM exercises WHERE user_id IS NULL GROUP BY name HAVING count(*) > 1;
CREATE UNIQUE INDEX "exercises_default_name_uniq" ON "exercises" USING btree ("name") WHERE "exercises"."user_id" is null;