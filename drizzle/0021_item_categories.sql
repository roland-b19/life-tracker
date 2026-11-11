CREATE TABLE "item_categories" (
	"user_id" uuid NOT NULL,
	"scope" varchar(20) NOT NULL,
	"name" varchar(50) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "item_categories_user_id_scope_name_pk" PRIMARY KEY("user_id","scope","name")
);
--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "category" varchar(50) DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD COLUMN "category" varchar(50) DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "item_categories" TO life_tracker_app;
