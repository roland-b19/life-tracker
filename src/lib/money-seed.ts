import { isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { expenseCategories } from "@/db/schema";

export const DEFAULT_CATEGORIES = [
  // Personal space
  { name: "Food & Groceries", space: "personal", icon: "🛒" },
  { name: "Gym & Supplements", space: "personal", icon: "🏋️" },
  { name: "Transport & Fuel", space: "personal", icon: "🚗" },
  { name: "Utilities & Bills", space: "personal", icon: "💡" },
  { name: "Dining & Leisure", space: "personal", icon: "☕" },
  { name: "Health & Pharmacy", space: "personal", icon: "💊" },
  { name: "Personal Other", space: "personal", icon: "📦" },

  // Business space
  { name: "Inventory & Stock", space: "business", icon: "📦" },
  { name: "Shipping & Logistics", space: "business", icon: "🚚" },
  { name: "Marketing & Ads", space: "business", icon: "📢" },
  { name: "Services & Software", space: "business", icon: "💻" },
  { name: "Business Other", space: "business", icon: "💼" },
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
            icon: c.icon,
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
