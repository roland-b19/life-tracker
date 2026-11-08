import {
  boolean,
  check,
  date,
  integer,
  numeric,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    issuer: varchar("issuer", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("users_issuer_subject_unique").on(table.issuer, table.subject)],
);

export const weightEntries = pgTable(
  "weight_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    kilograms: numeric("kilograms", { precision: 5, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("weight_entries_user_date_unique").on(table.userId, table.date),
    check("weight_entries_kilograms_range", sql`${table.kilograms} >= 20 AND ${table.kilograms} <= 500`),
  ],
);

export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    muscleGroup: varchar("muscle_group", { length: 50 }).notNull(),
    equipmentType: varchar("equipment_type", { length: 30 }).notNull(),
    isCustom: boolean("is_custom").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const workoutSplits = pgTable(
  "workout_splits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const workoutSplitDays = pgTable(
  "workout_split_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    splitId: uuid("split_id")
      .notNull()
      .references(() => workoutSplits.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(), // 0 = Sun, 1 = Mon, ..., 6 = Sat
    name: varchar("name", { length: 100 }).notNull(),
    isRest: boolean("is_rest").default(false).notNull(),
    orderIndex: integer("order_index").default(0).notNull(),
  },
  (table) => [
    unique("workout_split_days_split_day_unique").on(table.splitId, table.dayOfWeek),
  ],
);

export const workoutSplitDayExercises = pgTable(
  "workout_split_day_exercises",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    splitDayId: uuid("split_day_id")
      .notNull()
      .references(() => workoutSplitDays.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull(),
    targetSets: integer("target_sets").default(2).notNull(),
    minReps: integer("min_reps").default(5).notNull(),
    maxReps: integer("max_reps").default(8).notNull(),
  },
);

export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    splitDayId: uuid("split_day_id").references(() => workoutSplitDays.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    durationMinutes: integer("duration_minutes"),
    isDeload: boolean("is_deload").default(false).notNull(),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const workoutSets = pgTable(
  "workout_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    setOrder: integer("set_order").notNull(),
    reps: integer("reps").notNull(),
    loadType: varchar("load_type", { length: 20 }).notNull(), // 'kg', 'plates', 'bodyweight'
    loadValue: numeric("load_value", { precision: 6, scale: 2 }).notNull(),
    extraKg: numeric("extra_kg", { precision: 5, scale: 2 }).default("0").notNull(),
    isFailure: boolean("is_failure").default(true).notNull(),
    isPartial: boolean("is_partial").default(false).notNull(),
    flagAnomaly: boolean("flag_anomaly").default(false).notNull(),
    anomalyReason: varchar("anomaly_reason", { length: 50 }),
    notes: varchar("notes", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("workout_sets_reps_positive", sql`${table.reps} > 0`),
    check("workout_sets_load_non_negative", sql`${table.loadValue} >= 0`),
    check("workout_sets_extra_kg_non_negative", sql`${table.extraKg} >= 0`),
  ],
);

// --- FOOD & NUTRITION MODULE TABLES ---

export const nutritionTargets = pgTable(
  "nutrition_targets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    calories: integer("calories").default(3350).notNull(),
    proteinGrams: integer("protein_grams").default(170).notNull(),
    carbsGrams: integer("carbs_grams").default(300).notNull(),
    fatGrams: integer("fat_grams").default(80).notNull(),
    waterMl: integer("water_ml").default(3000).notNull(),
    steps: integer("steps").default(10000).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("nutrition_targets_user_unique").on(table.userId)],
);

export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    waterMl: integer("water_ml").default(0).notNull(),
    steps: integer("steps").default(0).notNull(),
    notes: varchar("notes", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("daily_metrics_user_date_unique").on(table.userId, table.date)],
);

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    calories: integer("calories").default(0).notNull(),
    protein: numeric("protein", { precision: 5, scale: 1 }).default("0").notNull(),
    carbs: numeric("carbs", { precision: 5, scale: 1 }).default("0").notNull(),
    fat: numeric("fat", { precision: 5, scale: 1 }).default("0").notNull(),
    isEstimated: boolean("is_estimated").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 500 }),
    calories: integer("calories").default(0).notNull(),
    protein: numeric("protein", { precision: 5, scale: 1 }).default("0").notNull(),
    carbs: numeric("carbs", { precision: 5, scale: 1 }).default("0").notNull(),
    fat: numeric("fat", { precision: 5, scale: 1 }).default("0").notNull(),
    isEstimated: boolean("is_estimated").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipeId: uuid("recipeId")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    amount: numeric("amount", { precision: 6, scale: 2 }).default("1").notNull(),
    unit: varchar("unit", { length: 30 }).default("g").notNull(),
    category: varchar("category", { length: 50 }).default("pantry").notNull(), // 'meat', 'produce', 'dairy', 'bakery', 'pantry', 'other'
  },
);

export const mealPlans = pgTable(
  "meal_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).default("Weekly Meal Plan").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const mealPlanDays = pgTable(
  "meal_plan_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => mealPlans.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(), // 0 = Sun, ..., 6 = Sat
    mealType: varchar("meal_type", { length: 30 }).notNull(),
    recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    customName: varchar("custom_name", { length: 120 }),
    calories: integer("calories").default(0).notNull(),
    protein: numeric("protein", { precision: 5, scale: 1 }).default("0").notNull(),
    carbs: numeric("carbs", { precision: 5, scale: 1 }).default("0").notNull(),
    fat: numeric("fat", { precision: 5, scale: 1 }).default("0").notNull(),
  },
);

export const shoppingItems = pgTable(
  "shopping_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    amount: numeric("amount", { precision: 6, scale: 2 }).default("1").notNull(),
    unit: varchar("unit", { length: 30 }).default("pcs").notNull(),
    category: varchar("category", { length: 50 }).default("other").notNull(),
    isBought: boolean("is_bought").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // Set when a bought item is cleared: hidden from the list, kept so Undo can restore it.
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
  },
);

/** The user's store sections, in walking order; "other" is built in and never stored. */
export const shoppingCategories = pgTable(
  "shopping_categories",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 50 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.name] })],
);

// --- MONEY MODULE TABLES ---

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 50 }).notNull(),
    space: varchar("space", { length: 20 }).default("personal").notNull(), // 'personal', 'business', 'both'
    icon: varchar("icon", { length: 30 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("expense_categories_default_unique_idx")
      .on(table.space, table.name)
      .where(sql`${table.userId} IS NULL`),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    space: varchar("space", { length: 20 }).default("personal").notNull(), // 'personal' | 'business'
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).default("RON").notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    date: date("date").notNull(),
    notes: varchar("notes", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("expenses_amount_positive", sql`${table.amount} > 0`),
  ],
);

// --- TO-DO & HABITS MODULE TABLES ---

export const todos = pgTable(
  "todos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    space: varchar("space", { length: 20 }).default("personal").notNull(), // 'personal' | 'business'
    title: varchar("title", { length: 150 }).notNull(),
    isRecurring: boolean("is_recurring").default(false).notNull(),
    recurrencePattern: varchar("recurrence_pattern", { length: 20 }).default("none").notNull(), // 'daily' | 'weekly' | 'none'
    dueDate: date("due_date").notNull(),
    reminderTime: varchar("reminder_time", { length: 10 }), // e.g. "09:00"
    isCompleted: boolean("is_completed").default(false).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    isCarriedOver: boolean("is_carried_over").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // A deleted repeating task stops here (not due on or after this day) but stays on the days before it.
    endedOn: date("ended_on"),
  },
);

// One row per day a repeating task was ticked; its streak is counted from these.
export const todoCompletions = pgTable(
  "todo_completions",
  {
    todoId: uuid("todo_id")
      .notNull()
      .references(() => todos.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
  },
  (table) => [primaryKey({ columns: [table.todoId, table.date] })],
);

// One frozen row per user, space, kind and day: how many tasks existed and how many were done.
export const todoDayStats = pgTable(
  "todo_day_stats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    space: varchar("space", { length: 20 }).notNull(),
    isRecurring: boolean("is_recurring").notNull(),
    date: date("date").notNull(),
    total: integer("total").notNull(),
    done: integer("done").notNull(),
  },
  (table) => [
    unique("todo_day_stats_unique").on(table.userId, table.space, table.isRecurring, table.date),
    check("todo_day_stats_range", sql`${table.done} >= 0 AND ${table.done} <= ${table.total}`),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: varchar("endpoint", { length: 500 }).notNull(),
    p256dhKey: varchar("p256dh_key", { length: 255 }).notNull(),
    authKey: varchar("auth_key", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

// --- AI CONNECTOR / API TOKENS ---

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 50 }).default("Claude / Gemini Food Connector").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    scope: varchar("scope", { length: 30 }).default("food").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

// The owner's Claude subscription token for the in-app Assistant, AES-256-GCM encrypted (src/lib/claude-connection.ts).
export const claudeConnections = pgTable("claude_connections", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenEncrypted: varchar("token_encrypted", { length: 1024 }).notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- TIER 3: WISHLIST ---

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    url: varchar("url", { length: 500 }),
    estimatedPrice: numeric("estimated_price", { precision: 10, scale: 2 }).notNull(),
    priority: varchar("priority", { length: 10 }).default("medium").notNull(), // 'low', 'medium', 'high'
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("wishlist_price_positive", sql`${table.estimatedPrice} > 0`),
  ],
);

// --- TIER 3: FAMILY BUSINESS ---

export const businessIncomes = pgTable(
  "business_incomes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    category: varchar("category", { length: 50 }).default("Sales").notNull(),
    date: date("date").notNull(),
    note: varchar("note", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("business_income_positive", sql`${table.amount} > 0`),
  ],
);
