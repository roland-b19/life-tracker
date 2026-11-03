CREATE TABLE "daily_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"water_ml" integer DEFAULT 0 NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"notes" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_metrics_user_date_unique" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "meal_plan_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"meal_type" varchar(30) NOT NULL,
	"recipe_id" uuid,
	"custom_name" varchar(120),
	"calories" integer DEFAULT 0 NOT NULL,
	"protein" numeric(5, 1) DEFAULT '0' NOT NULL,
	"carbs" numeric(5, 1) DEFAULT '0' NOT NULL,
	"fat" numeric(5, 1) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) DEFAULT 'Weekly Meal Plan' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"meal_type" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"calories" integer DEFAULT 0 NOT NULL,
	"protein" numeric(5, 1) DEFAULT '0' NOT NULL,
	"carbs" numeric(5, 1) DEFAULT '0' NOT NULL,
	"fat" numeric(5, 1) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"calories" integer DEFAULT 3350 NOT NULL,
	"protein_grams" integer DEFAULT 170 NOT NULL,
	"carbs_grams" integer DEFAULT 300 NOT NULL,
	"fat_grams" integer DEFAULT 80 NOT NULL,
	"water_ml" integer DEFAULT 3000 NOT NULL,
	"steps" integer DEFAULT 10000 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nutrition_targets_user_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipeId" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"amount" numeric(6, 2) DEFAULT '1' NOT NULL,
	"unit" varchar(30) DEFAULT 'g' NOT NULL,
	"category" varchar(50) DEFAULT 'pantry' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500),
	"calories" integer DEFAULT 0 NOT NULL,
	"protein" numeric(5, 1) DEFAULT '0' NOT NULL,
	"carbs" numeric(5, 1) DEFAULT '0' NOT NULL,
	"fat" numeric(5, 1) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"amount" numeric(6, 2) DEFAULT '1' NOT NULL,
	"unit" varchar(30) DEFAULT 'pcs' NOT NULL,
	"category" varchar(50) DEFAULT 'other' NOT NULL,
	"is_bought" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_days" ADD CONSTRAINT "meal_plan_days_plan_id_meal_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_days" ADD CONSTRAINT "meal_plan_days_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_targets" ADD CONSTRAINT "nutrition_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipeId_recipes_id_fk" FOREIGN KEY ("recipeId") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "nutrition_targets" TO life_tracker_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "daily_metrics" TO life_tracker_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "meals" TO life_tracker_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "recipes" TO life_tracker_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "recipe_ingredients" TO life_tracker_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "meal_plans" TO life_tracker_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "meal_plan_days" TO life_tracker_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "shopping_items" TO life_tracker_app;
