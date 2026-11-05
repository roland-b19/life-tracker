import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { weightEntries } from "@/db/schema";

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

export async function createWeightEntry(userId: string, date: string, kilograms: number) {
  const [entry] = await db
    .insert(weightEntries)
    .values({ userId, date, kilograms: kilograms.toFixed(2) })
    .returning({
      id: weightEntries.id,
      date: weightEntries.date,
      kilograms: weightEntries.kilograms,
    });
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
  return entry;
}
