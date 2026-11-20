import {
  boolean,
  check,
  date,
  index,
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
  // The shared defaults (no owner) are seeded on demand: two requests at once must not both insert them.
  (table) => [
    uniqueIndex("exercises_default_name_uniq").on(table.name).where(sql`${table.userId} is null`),
    // One name per user, ignoring case: the picker never lists two of the same name, even when two requests race.
    uniqueIndex("exercises_user_name_uniq").on(table.userId, sql`lower(${table.name})`).where(sql`${table.userId} is not null`),
  ],
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
  // An exercise appears once in a day; this index also serves the lookup by day.
  (table) => [unique("workout_split_day_exercises_day_exercise_unique").on(table.splitDayId, table.exerciseId)],
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
    // The workout timer lives on the server (D-039): seconds counted before the last pause, and when it last started
    // running (null while paused), so every device shows the same time and it keeps counting while the app is closed.
    timerSeconds: integer("timer_seconds").default(0).notNull(),
    timerRunningSince: timestamp("timer_running_since", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("workout_sessions_user_date_idx").on(table.userId, table.date),
    // One open workout (no duration yet) per user, even when two requests race.
    uniqueIndex("workout_sessions_one_open_uniq").on(table.userId).where(sql`${table.durationMinutes} is null`),
    check("workout_sessions_timer_non_negative", sql`${table.timerSeconds} >= 0`),
  ],
);

/** Weeks the user marked as deload (the Sunday that starts each): a plan that does not need a workout yet. */
export const deloadWeeks = pgTable(
  "deload_weeks",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.weekStart] })],
);

/** What one plate weighs, per exercise, so plate-loaded sets chart in kg (D-038). */
export const exercisePlateWeights = pgTable(
  "exercise_plate_weights",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    kg: numeric("kg", { precision: 6, scale: 2 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.exerciseId] }),
    check("exercise_plate_weights_kg_positive", sql`${table.kg} > 0`),
  ],
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
    isGoodForm: boolean("is_good_form").default(true).notNull(),
    flagAnomaly: boolean("flag_anomaly").default(false).notNull(),
    anomalyReason: varchar("anomaly_reason", { length: 50 }),
    notes: varchar("notes", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("workout_sets_session_idx").on(table.sessionId),
    index("workout_sets_user_idx").on(table.userId),
    index("workout_sets_user_exercise_idx").on(table.userId, table.exerciseId, table.createdAt),
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
    /** Removed from the "Past foods" list; the meal itself stays in its day. */
    forgotten: boolean("forgotten").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("meals_user_date_idx").on(table.userId, table.date)],
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
    // When the box last changed (bought or not bought again): bought items list the latest first, an item put back goes last.
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // Set when a bought item is cleared: hidden from the list, kept so Undo can restore it.
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
  },
  (table) => [index("shopping_items_user_idx").on(table.userId)],
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

/** The user's shopping units (g, kg, pack ...), in display order; "pcs" is built in and never stored. */
export const shoppingUnits = pgTable(
  "shopping_units",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 30 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.name] })],
);

/** The user's own categories for a list ("wishlist", "personal" or "business" daily tasks), in display order; "other" is built in and never stored. */
export const itemCategories = pgTable(
  "item_categories",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: varchar("scope", { length: 20 }).notNull(),
    name: varchar("name", { length: 50 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.scope, table.name] })],
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
    recurrencePattern: varchar("recurrence_pattern", { length: 20 }).default("none").notNull(), // 'daily' | 'none'
    dueDate: date("due_date").notNull(),
    reminderTime: varchar("reminder_time", { length: 10 }), // e.g. "09:00"
    isCompleted: boolean("is_completed").default(false).notNull(),
    // When the box last changed (ticked or unticked). A repeating task is done only if it was ticked today: the next day it reads as open.
    completedAt: timestamp("completed_at", { withTimezone: true }),
    isCarriedOver: boolean("is_carried_over").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // When the task last took its place in a list (created, moved, carried over, restored): the newest is on top.
    placedAt: timestamp("placed_at", { withTimezone: true }).defaultNow().notNull(),
    category: varchar("category", { length: 50 }).default("other").notNull(),
  },
  (table) => [index("todos_user_space_due_idx").on(table.userId, table.space, table.dueDate)],
);

/**
 * One row per signed-in device (D-041): the JWT carries its id (`sid`), and a token whose row is gone is signed out.
 * `lastSeenAt` moves at most once a day while the device is used; sign-in prunes rows unseen for the token's max age,
 * since a rolling token in daily use outlives its row's `createdAt`.
 */
export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("user_sessions_user_idx").on(table.userId)],
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
    category: varchar("category", { length: 50 }).default("other").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("wishlist_price_positive", sql`${table.estimatedPrice} > 0`),
  ],
);
