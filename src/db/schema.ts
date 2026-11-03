import {
  boolean,
  check,
  date,
  integer,
  numeric,
  pgTable,
  timestamp,
  unique,
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
