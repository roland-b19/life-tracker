ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_kilograms_range" CHECK ("weight_entries"."kilograms" >= 20 AND "weight_entries"."kilograms" <= 500);
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "users" TO life_tracker_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "weight_entries" TO life_tracker_app;