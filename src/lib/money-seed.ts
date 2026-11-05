import { isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { expenseCategories } from "@/db/schema";

export const DEFAULT_CATEGORIES = [
  { name: "Food & Groceries", space: "personal" },
  { name: "Gym & Supplements", space: "personal" },
  { name: "Transport & Fuel", space: "personal" },
  { name: "Utilities & Bills", space: "personal" },
  { name: "Dining & Leisure", space: "personal" },
  { name: "Health & Pharmacy", space: "personal" },
  { name: "Personal Other", space: "personal" },
] as const;

let ensurePromise: Promise<void> | null = null;

export async function ensureDefaultCategories(): Promise<void> {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const existing = await db
      .select({ name: expenseCategories.name, space: expenseCategories.space })
      .from(expenseCategories)
      .where(isNull(expenseCategories.userId));

    const existingSet = new Set(existing.map((c) => `${c.space}_${c.name}`));

    const toInsert = DEFAULT_CATEGORIES.filter(
      (c) => !existingSet.has(`${c.space}_${c.name}`),
    );

    if (toInsert.length > 0) {
      await db
        .insert(expenseCategories)
        .values(
          toInsert.map((c) => ({
            name: c.name,
            space: c.space,
            userId: null,
          })),
        )
        .onConflictDoNothing();
    }
  })().finally(() => {
    ensurePromise = null;
  });

  return ensurePromise;
}
