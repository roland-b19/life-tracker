CREATE TABLE "claude_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"token_encrypted" varchar(1024) NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claude_connections" ADD CONSTRAINT "claude_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "claude_connections" TO life_tracker_app;
