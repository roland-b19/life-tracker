import { and, desc, eq, lt } from "drizzle-orm";
import { addDays, toISODate } from "@/lib/format-date";
import { db } from "./db";
import { weightEntries } from "@/db/schema";

/** Health keeps the last 365 days of weigh-ins only: older ones go when one is written. */
const pruneWeights = (userId: string) =>
  db.delete(weightEntries).where(and(eq(weightEntries.userId, userId), lt(weightEntries.date, addDays(toISODate(), -364))));

export async function listWeightEntries(userId: string) {
  return db
    .select({
      id: weightEntries.id,
      date: weightEntries.date,
      kilograms: weightEntries.kilograms,
    })
    .from(weightEntries)
    .where(eq(weightEntries.userId, userId))
    .orderBy(desc(weightEntries.date));
}

/** With `id` (an Undo) a taken id or day gives back undefined instead of an error. */
export async function createWeightEntry(userId: string, date: string, kilograms: number, id?: string) {
  const insert = db.insert(weightEntries).values({ id, userId, date, kilograms: kilograms.toFixed(2) });
  const [entry] = await (id ? insert.onConflictDoNothing() : insert).returning({
      id: weightEntries.id,
      date: weightEntries.date,
      kilograms: weightEntries.kilograms,
    });
  await pruneWeights(userId);
  return entry;
}

export async function removeWeightEntry(userId: string, id: string) {
  const [entry] = await db
    .delete(weightEntries)
    .where(and(eq(weightEntries.id, id), eq(weightEntries.userId, userId)))
    .returning({ id: weightEntries.id });
  return entry;
}

export async function updateWeightEntry(userId: string, id: string, date: string, kilograms: number) {
  const [entry] = await db
    .update(weightEntries)
    .set({ date, kilograms: kilograms.toFixed(2) })
    .where(and(eq(weightEntries.id, id), eq(weightEntries.userId, userId)))
    .returning({
      id: weightEntries.id,
      date: weightEntries.date,
      kilograms: weightEntries.kilograms,
    });
  await pruneWeights(userId);
  return entry;
}
