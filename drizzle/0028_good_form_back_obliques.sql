-- Every logged set can say whether its form was good (existing sets read as good).
ALTER TABLE "workout_sets" ADD COLUMN "is_good_form" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Lats, upper back and lower back become one group "Back"; abs and obliques become one group "Obliques".
UPDATE "exercises" SET "muscle_group" = 'back' WHERE "muscle_group" IN ('lats', 'upper-back', 'lower-back');--> statement-breakpoint
UPDATE "exercises" SET "muscle_group" = 'obliques' WHERE "muscle_group" = 'abs';
