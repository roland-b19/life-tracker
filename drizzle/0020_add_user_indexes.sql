CREATE INDEX "meals_user_date_idx" ON "meals" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "shopping_items_user_idx" ON "shopping_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "todos_user_space_due_idx" ON "todos" USING btree ("user_id","space","due_date");--> statement-breakpoint
CREATE INDEX "workout_sessions_user_date_idx" ON "workout_sessions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "workout_sets_session_idx" ON "workout_sets" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "workout_sets_user_idx" ON "workout_sets" USING btree ("user_id");