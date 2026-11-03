import {
  date,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
  check,
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
