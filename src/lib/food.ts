import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  dailyMetrics,
  meals,
  nutritionTargets,
  shoppingCategories,
  shoppingItems,
  shoppingUnits,
  weightEntries,
} from "@/db/schema";
import {
  AddShoppingItemInput,
  LogMealInput,
  LogWeightInput,
  RestoreMealInput,
  RestoreWeightInput,
  UpdateShoppingItemInput,
  UpdateNutritionTargetsInput,
  CHANGED_ELSEWHERE,
  MAX_SHOPPING_AMOUNT,
  MAX_SHOPPING_NAMES,
  type RevertShoppingCategoryInput,
  type ValueChange,
} from "./validations/food";
import { Refusal } from "./validations/result";
import { ensureUserNutritionTargets } from "./food-seed";
import type { CategoryChange } from "./categories";
import { compareShopping } from "./check-order";
import { addDays } from "./format-date";
import { formatAmount } from "./number-format";
import { lockUser } from "./gym-seed";


export async function getNutritionTargets(userId: string) {
  return ensureUserNutritionTargets(userId);
}

/**
 * Writes only the goals the edit changed, and only while each still holds the value the edit showed (`from`); the others
 * keep their stored value. A missing row counts as the column defaults, which the screen showed. When any changed goal no
 * longer matches (another device changed it first), nothing is written and the edit is refused.
 */
export function updateNutritionTargets(userId: string, input: UpdateNutritionTargetsInput, tx?: Pick<typeof db, "insert" | "update">) {
  return tx ? writeTargets(tx, userId, input) : db.transaction((own) => writeTargets(own, userId, input));
}

async function writeTargets(tx: Pick<typeof db, "insert" | "update">, userId: string, input: UpdateNutritionTargetsInput) {
  const changes = Object.entries(input).filter((entry): entry is [keyof typeof input, ValueChange] => entry[1] !== undefined);
  await tx.insert(nutritionTargets).values({ userId }).onConflictDoNothing();
  const [updated] = await tx
    .update(nutritionTargets)
    .set({ ...Object.fromEntries(changes.map(([key, change]) => [key, change.to])), updatedAt: new Date() })
    .where(and(eq(nutritionTargets.userId, userId), ...changes.map(([key, change]) => eq(nutritionTargets[key], change.from))))
    .returning();
  if (!updated) throw new Refusal(CHANGED_ELSEWHERE);
  return updated;
}

export async function getDailyFoodSummary(userId: string, date: string) {
  const [dayMeals, [metrics]] = await Promise.all([
    db
      .select()
      .from(meals)
      .where(and(eq(meals.userId, userId), eq(meals.date, date)))
      .orderBy(meals.createdAt),
    db
      .select()
      .from(dailyMetrics)
      .where(and(eq(dailyMetrics.userId, userId), eq(dailyMetrics.date, date)))
      .limit(1),
  ]);

  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;

  for (const m of dayMeals) {
    totalCalories += m.calories;
    totalProtein += parseFloat(m.protein) || 0;
    totalCarbs += parseFloat(m.carbs) || 0;
    totalFat += parseFloat(m.fat) || 0;
  }

  return {
    date,
    meals: dayMeals,
    totals: {
      calories: totalCalories,
      protein: Math.round(totalProtein * 10) / 10,
      carbs: Math.round(totalCarbs * 10) / 10,
      fat: Math.round(totalFat * 10) / 10,
    },
    metrics: metrics ?? {
      waterMl: 0,
      steps: 0,
      notes: null,
    },
  };
}

/**
 * Adds a meal under the id the device made, when it sent one: a repeat of the same add finds the row already there and
 * answers it. An id another user's meal holds writes nothing and answers null, so it neither changes nor shows that row.
 */
export async function logMeal(userId: string, input: LogMealInput) {
  const created = await db
    .insert(meals)
    .values({
      id: input.id,
      userId,
      date: input.date,
      name: input.name,
      calories: input.calories,
      protein: input.protein.toFixed(1),
      carbs: input.carbs.toFixed(1),
      fat: input.fat.toFixed(1),
      isEstimated: input.isEstimated ?? false,
    })
    .onConflictDoNothing()
    .returning()
    .then((rows) => rows.at(0));
  if (created || !input.id) return created ?? null;

  const own = await db.select().from(meals).where(and(eq(meals.id, input.id), eq(meals.userId, userId)));
  return own.at(0) ?? null;
}

/** Undo of a delete: the meal comes back under its old id and time. A taken id gives back undefined. */
export async function restoreMeal(userId: string, input: RestoreMealInput) {
  const [restored] = await db
    .insert(meals)
    .values({
      id: input.id,
      userId,
      date: input.date,
      name: input.name,
      calories: input.calories,
      protein: input.protein.toFixed(1),
      carbs: input.carbs.toFixed(1),
      fat: input.fat.toFixed(1),
      isEstimated: input.isEstimated ?? false,
      createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
    })
    .onConflictDoNothing()
    .returning();
  return restored;
}

/**
 * Foods logged before, newest first, one entry per name: the assistant's context. Meals marked `forgotten` (the removed
 * forget feature set it before c23e0cb; nothing writes it now) stay out of it.
 */
export async function getPastFoods(userId: string, limit = 40) {
  const latest = db
    .selectDistinctOn([sql`lower(${meals.name})`], {
      name: meals.name,
      calories: meals.calories,
      protein: meals.protein,
      carbs: meals.carbs,
      fat: meals.fat,
      isEstimated: meals.isEstimated,
      createdAt: meals.createdAt,
    })
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.forgotten, false)))
    .orderBy(sql`lower(${meals.name})`, desc(meals.createdAt))
    .as("latest");
  return db.select().from(latest).orderBy(desc(latest.createdAt)).limit(limit);
}

/** `assertDay` throws for a day that can no longer change, so a delete never outlives the day its Undo is allowed on. */
export async function deleteMeal(userId: string, mealId: string, assertDay?: (date: string) => void) {
  if (assertDay) {
    const [meal] = await db.select({ date: meals.date }).from(meals).where(and(eq(meals.id, mealId), eq(meals.userId, userId)));
    if (meal) assertDay(meal.date);
  }
  const [deleted] = await db
    .delete(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
    .returning();

  return deleted;
}

/**
 * Sets a day's water or steps total and/or its daily goal in one transaction: both are written or neither. Each part is
 * written only when given, only its own column, and only while it still holds the value the screen showed (`from`; a
 * day with no row holds 0). Otherwise nothing is written and the save is refused. Answers the day's row and the goals
 * row (null for a part not written).
 */
async function saveDayMetric(userId: string, date: string, metric: "waterMl" | "steps", amount?: ValueChange, goal?: ValueChange) {
  return db.transaction(async (tx) => {
    let metrics: typeof dailyMetrics.$inferSelect | null = null;
    if (amount !== undefined) {
      await tx.insert(dailyMetrics).values({ userId, date }).onConflictDoNothing();
      [metrics] = await tx
        .update(dailyMetrics)
        .set({ [metric]: amount.to })
        .where(and(eq(dailyMetrics.userId, userId), eq(dailyMetrics.date, date), eq(dailyMetrics[metric], amount.from)))
        .returning();
      if (!metrics) throw new Refusal(CHANGED_ELSEWHERE);
      await pruneMetrics(tx, userId, date);
    }
    const targets = goal === undefined ? null : await updateNutritionTargets(userId, { [metric]: goal }, tx);
    return { metrics, targets };
  });
}

export const updateDailyWater = (userId: string, date: string, waterMl?: ValueChange, goal?: ValueChange) =>
  saveDayMetric(userId, date, "waterMl", waterMl, goal);

export const updateDailySteps = (userId: string, date: string, steps?: ValueChange, goal?: ValueChange) =>
  saveDayMetric(userId, date, "steps", steps, goal);

/** Health keeps water and steps for the last 7 days only (the 7-day average): older rows go when a day is written. */
const pruneMetrics = (tx: Pick<typeof db, "delete">, userId: string, date: string) =>
  tx.delete(dailyMetrics).where(and(eq(dailyMetrics.userId, userId), lt(dailyMetrics.date, addDays(date, -6))));

/** The days with water or steps logged in the last 7 days up to `today`, newest first. */
export async function getDailyMetricsHistory(userId: string, today: string) {
  return db
    .select({ date: dailyMetrics.date, waterMl: dailyMetrics.waterMl, steps: dailyMetrics.steps })
    .from(dailyMetrics)
    .where(and(eq(dailyMetrics.userId, userId), gte(dailyMetrics.date, addDays(today, -6)), lte(dailyMetrics.date, today)))
    .orderBy(desc(dailyMetrics.date));
}

/**
 * Shopping List Operations
 */
/** The user's items still on the list; cleared ones stay (only the last Clear bought's batch, D-042) so Undo can restore them. */
const onList = (userId: string) => and(eq(shoppingItems.userId, userId), isNull(shoppingItems.clearedAt));

/** One item on the list per name (any case) and unit (D-042): the rows an add, a restore or a unit change merges. */
const itemKey = (row: { name: string; unit: string }) => `${row.name.toLowerCase()}\u0000${row.unit}`;

const ITEM_NOT_SAVED = "This item could not be saved.";

/** The two decimals the amount column keeps. */
const round2 = (value: number) => Math.round(value * 100) / 100;

const tooMuch = (name: string, amount: number, unit: string) =>
  new Refusal(`"${name}" would be ${formatAmount(amount, 2)} ${unit}; the most is ${formatAmount(MAX_SHOPPING_AMOUNT, 0)}.`);

/** Serialises the user's shopping writes that look for a row to merge into, so two at once never make two rows. */
const lockShopping = (tx: Pick<typeof db, "execute">, userId: string) => lockUser(tx, "shopping", userId);

export async function getShoppingList(userId: string) {
  return db
    .select()
    .from(shoppingItems)
    .where(onList(userId))
    .orderBy(shoppingItems.category, shoppingItems.name)
    .then((rows) => rows.sort(compareShopping));
}

/**
 * Adds an item, or adds its amount to the same item (same name and unit) already on the list, which then takes the new
 * category (D-042); a bought one starts over at the new amount. `before` is the row as it was before a merge (null for a
 * new row), so Undo can put it back. The add carries the id the device made (D-040): a repeat answers the row it made;
 * an id another user's row holds writes nothing and is refused. A merge past the amount cap is refused.
 */
export async function addShoppingItem(userId: string, input: AddShoppingItemInput) {
  return db.transaction(async (tx) => {
    await lockShopping(tx, userId);
    if (input.id) {
      const [made] = await tx.select().from(shoppingItems).where(eq(shoppingItems.id, input.id));
      if (made && made.userId !== userId) throw new Refusal(ITEM_NOT_SAVED);
      if (made) return { item: made, before: null };
    }
    await ensureShoppingCategory(userId, input.category, "category", tx);
    await ensureShoppingCategory(userId, input.unit, "unit", tx);
    const [same] = await tx
      .select()
      .from(shoppingItems)
      .where(and(onList(userId), sql`lower(${shoppingItems.name}) = lower(${input.name})`, eq(shoppingItems.unit, input.unit)))
      .limit(1);

    if (same) {
      const amount = same.isBought ? input.amount : round2(Number(same.amount) + input.amount);
      if (amount > MAX_SHOPPING_AMOUNT) throw tooMuch(same.name, amount, same.unit);
      const [item] = await tx
        .update(shoppingItems)
        .set({ amount: amount.toFixed(2), category: input.category, isBought: false, checkedAt: new Date() })
        .where(eq(shoppingItems.id, same.id))
        .returning();
      return { item, before: same };
    }

    const [item] = await tx
      .insert(shoppingItems)
      .values({ id: input.id, userId, name: input.name, amount: input.amount.toFixed(2), unit: input.unit, category: input.category, isBought: false })
      .onConflictDoNothing()
      .returning();
    if (!item) throw new Refusal(ITEM_NOT_SAVED); // the id was taken in between
    return { item, before: null };
  });
}

/** Whether another item on the list already has this name and unit (any case): the add form merges those, so an edit must not make two. */
export async function hasDuplicateShoppingItem(userId: string, input: { itemId: string; name: string; unit: string }) {
  const [row] = await db
    .select({ id: shoppingItems.id })
    .from(shoppingItems)
    .where(
      and(
        onList(userId),
        ne(shoppingItems.id, input.itemId),
        sql`lower(${shoppingItems.name}) = lower(${input.name})`,
        sql`lower(${shoppingItems.unit}) = lower(${input.unit})`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function updateShoppingItem(userId: string, input: UpdateShoppingItemInput) {
  const [updated] = await db
    .update(shoppingItems)
    .set({
      name: input.name,
      amount: input.amount.toFixed(2),
      unit: input.unit,
      category: input.category,
      ...(input.isBought !== undefined && { isBought: input.isBought }),
      ...(input.checkedAt !== undefined && { checkedAt: input.checkedAt }),
    })
    .where(and(eq(shoppingItems.id, input.itemId), onList(userId)))
    .returning();
  if (updated) {
    await ensureShoppingCategory(userId, input.category);
    await ensureShoppingCategory(userId, input.unit, "unit");
  }
  return updated;
}

/**
 * A shopping item is filed by two lists the user manages: its category (store section) and its unit. Both work the
 * same way, so the functions below take the `kind`; the "Category" in their names then means either list.
 */
const DIMS = {
  category: {
    table: shoppingCategories,
    fallback: "other",
    defaults: ["meat", "produce", "dairy", "bakery", "pantry"], // a new user's store sections, in walking order
    column: shoppingItems.category,
  },
  unit: {
    // shortcut: same columns as shopping_categories, so the one table type serves both; give them a shared type if a third list appears.
    table: shoppingUnits as unknown as typeof shoppingCategories,
    fallback: "pcs",
    defaults: ["g", "kg", "ml", "l", "pack", "bottle", "can", "jar", "box", "bag", "bunch"],
    column: shoppingItems.unit,
  },
};
type ShoppingKind = keyof typeof DIMS;
type Tx = Pick<typeof db, "update" | "select">;

const ownCategory = (userId: string, name: string, kind: ShoppingKind) =>
  and(eq(DIMS[kind].table.userId, userId), eq(DIMS[kind].table.name, name));

/** Adds a name at the end of the user's list unless it is there already or is the built-in fallback ("other", "pcs"). */
async function ensureShoppingCategory(userId: string, name: string, kind: ShoppingKind = "category", q: Pick<typeof db, "insert"> = db) {
  const { table, fallback } = DIMS[kind];
  if (name === fallback) return;
  await q
    .insert(table)
    .values({
      userId,
      name,
      sortOrder: sql`(select coalesce(max(${table.sortOrder}), 0) + 1 from ${table} where ${table.userId} = ${userId})`,
    })
    .onConflictDoNothing();
}

/** The user's names in order, without the fallback. */
export async function getShoppingCategories(userId: string, kind: ShoppingKind = "category"): Promise<string[]> {
  const { table } = DIMS[kind];
  const list = () =>
    db
      .select({ name: table.name })
      .from(table)
      .where(eq(table.userId, userId))
      .orderBy(asc(table.sortOrder), asc(table.name));
  const rows = await list();
  if (rows.length > 0) return rows.map((r) => r.name);
  // Read again even when this call did not seed: the page reads both lists at once, so the other one may have.
  await seedShoppingNames(userId);
  return (await list()).map((r) => r.name);
}

/**
 * A new user's two lists start with the defaults. Only a user with no name in either list and no shopping item yet
 * counts as new, so a list the user emptied stays empty (D-042).
 * shortcut: a user who empties both lists and has no item row left (not even the last cleared batch) looks new and gets
 * the defaults again; store a "seeded" flag (a migration) if that annoys.
 */
async function seedShoppingNames(userId: string) {
  const { rows } = await db.execute<{ fresh: boolean }>(sql`select not exists (select 1 from ${shoppingCategories} where ${shoppingCategories.userId} = ${userId})
    and not exists (select 1 from ${shoppingUnits} where ${shoppingUnits.userId} = ${userId})
    and not exists (select 1 from ${shoppingItems} where ${shoppingItems.userId} = ${userId}) as fresh`);
  if (!rows[0]?.fresh) return;
  for (const { table, defaults } of Object.values(DIMS))
    await db
      .insert(table)
      .values(defaults.map((name, i) => ({ userId, name, sortOrder: i + 1 })))
      .onConflictDoNothing();
}

/** Puts the user's names in the given order, top first; names that are not theirs change nothing. */
export async function reorderShoppingCategories(userId: string, names: string[], kind: ShoppingKind = "category") {
  const { table } = DIMS[kind];
  await db.transaction(async (tx) => {
    for (const [i, name] of names.entries()) await tx.update(table).set({ sortOrder: i + 1 }).where(ownCategory(userId, name, kind));
  });
}

/** Returns false when the user already has a name like that; refuses a name past the list's cap. */
export async function addShoppingCategory(userId: string, name: string, kind: ShoppingKind = "category") {
  const { table } = DIMS[kind];
  const names = await db.select({ name: table.name }).from(table).where(eq(table.userId, userId));
  if (names.some((n) => n.name === name)) return false;
  if (names.length >= MAX_SHOPPING_NAMES) throw new Refusal(`You can have at most ${MAX_SHOPPING_NAMES} ${kind === "unit" ? "units" : "categories"}.`);
  await ensureShoppingCategory(userId, name, kind);
  return true;
}

/** What a shopping rename or delete changed. A unit change also reports the rows it merged and the amounts it converted. */
export type ShoppingChange = CategoryChange & {
  /** A row (`id`) merged into another (`into`) whose values before are kept here: Undo puts both back. */
  merges?: { id: string; into: string; amount: number; category: string; isBought: boolean }[];
  /** The amounts a g/kg or ml/l change converted, as they were: Undo writes them back. */
  amounts?: { id: string; amount: number }[];
};

/** g and kg, ml and l convert into each other (D-042); any other two units do not. */
const UNIT_FACTOR: Record<string, Record<string, number>> = { g: { kg: 0.001 }, kg: { g: 1000 }, ml: { l: 0.001 }, l: { ml: 1000 } };

/**
 * Re-files the user's items (history included) from one name to another; `only` limits it to those ids (Undo).
 * Returns the ids moved; a unit change also returns its merges and converted amounts (see `moveUnit`).
 */
async function moveShoppingItems(
  tx: Tx,
  userId: string,
  from: string,
  to: string,
  kind: ShoppingKind,
  only?: string[],
  exact?: Map<string, number>,
): Promise<Pick<ShoppingChange, "itemIds" | "merges" | "amounts">> {
  if (kind === "unit") return moveUnit(tx, userId, from, to, only, exact);
  const rows = await tx
    .update(shoppingItems)
    .set({ category: to })
    .where(and(eq(shoppingItems.userId, userId), eq(shoppingItems.category, from), only && inArray(shoppingItems.id, only)))
    .returning({ id: shoppingItems.id });
  return { itemIds: rows.map((r) => r.id) };
}

/**
 * Moves the items of one unit to another, so no two rows on the list share a name and unit (D-042). An item whose name
 * is already on the list in the new unit merges into that row, which takes its category: g and kg (ml and l) are added
 * up after conversion, any other two units are refused, and so is a sum past the cap. The merged item leaves the list
 * (cleared, in its old unit). Every other item takes the new unit; between g and kg (ml and l) its amount converts, and
 * a converted amount on the list outside 0,01–1.000 is refused. `exact` holds amounts as they were before an earlier
 * conversion (Undo): an amount still at its converted value gets exactly that back, so 125 g → 0,13 kg → 125 g.
 */
async function moveUnit(tx: Tx, userId: string, from: string, to: string, only?: string[], exact?: Map<string, number>) {
  const factor = UNIT_FACTOR[from]?.[to];
  const rows = await tx
    .select()
    .from(shoppingItems)
    .where(and(eq(shoppingItems.userId, userId), eq(shoppingItems.unit, from), only && inArray(shoppingItems.id, only)));
  const there = await tx.select().from(shoppingItems).where(and(onList(userId), eq(shoppingItems.unit, to)));
  const byKey = new Map(there.map((r) => [itemKey(r), r]));
  const itemIds: string[] = [];
  const merges: NonNullable<ShoppingChange["merges"]> = [];
  const amounts: NonNullable<ShoppingChange["amounts"]> = [];
  const now = new Date();
  for (const row of rows) {
    const amount = Number(row.amount);
    const into = row.clearedAt === null ? byKey.get(itemKey({ name: row.name, unit: to })) : undefined;
    if (into) {
      if (!factor) throw new Refusal(`"${row.name}" is on the list in both ${from} and ${to}, which can't be added up. Change one of them first.`);
      const sum = round2(Number(into.amount) + amount * factor);
      if (sum > MAX_SHOPPING_AMOUNT) throw tooMuch(into.name, sum, to);
      merges.push({ id: row.id, into: into.id, amount: Number(into.amount), category: into.category, isBought: into.isBought });
      const [merged] = await tx
        .update(shoppingItems)
        .set({ amount: sum.toFixed(2), category: row.category, isBought: into.isBought && row.isBought })
        .where(eq(shoppingItems.id, into.id))
        .returning();
      byKey.set(itemKey(merged), merged);
      await tx.update(shoppingItems).set({ clearedAt: now }).where(eq(shoppingItems.id, row.id));
      continue;
    }
    itemIds.push(row.id);
    if (!factor) continue;
    const back = exact?.get(row.id);
    const raw = back !== undefined && round2(back / factor) === amount ? back : amount * factor;
    if (row.clearedAt === null && (raw < 0.01 || raw > MAX_SHOPPING_AMOUNT))
      throw new Refusal(`"${row.name}" would be ${formatAmount(raw, 3)} ${to}; an amount is between 0,01 and ${formatAmount(MAX_SHOPPING_AMOUNT, 0)}.`);
    amounts.push({ id: row.id, amount });
    // A cleared row is history: it keeps the nearest amount the column allows.
    const next = Math.min(MAX_SHOPPING_AMOUNT, Math.max(0.01, round2(raw)));
    await tx.update(shoppingItems).set({ unit: to, amount: next.toFixed(2) }).where(eq(shoppingItems.id, row.id));
  }
  if (!factor && itemIds.length > 0) await tx.update(shoppingItems).set({ unit: to }).where(inArray(shoppingItems.id, itemIds));
  // The merged rows count as touched too, so a later edit of either takes the change's Undo away (D-040).
  return { itemIds: [...itemIds, ...merges.flatMap((m) => [m.id, m.into])], merges, amounts };
}

/** Renames on all the user's items, history included; renaming onto an existing name merges the two. */
export async function renameShoppingCategory(userId: string, from: string, to: string, kind: ShoppingKind = "category") {
  const { table } = DIMS[kind];
  return db.transaction(async (tx): Promise<ShoppingChange | null> => {
    await lockShopping(tx, userId);
    const [old] = await tx.delete(table).where(ownCategory(userId, from, kind)).returning();
    if (!old) return null;
    const created = await tx.insert(table).values({ userId, name: to, sortOrder: old.sortOrder }).onConflictDoNothing().returning();
    return { sortOrder: old.sortOrder, ...(await moveShoppingItems(tx, userId, from, to, kind)), merged: created.length === 0 };
  });
}

/** Deletes a name; its items, history included, move to the fallback. */
export async function deleteShoppingCategory(userId: string, name: string, kind: ShoppingKind = "category") {
  const { table, fallback } = DIMS[kind];
  return db.transaction(async (tx): Promise<ShoppingChange | null> => {
    await lockShopping(tx, userId);
    const [old] = await tx.delete(table).where(ownCategory(userId, name, kind)).returning();
    if (!old) return null;
    return { sortOrder: old.sortOrder, ...(await moveShoppingItems(tx, userId, name, fallback, kind)), merged: false };
  });
}

/**
 * Undoes a rename or delete the way `revertCategory` does for the other lists: the name comes back at its old place
 * (the ones from there on move down by one), exactly the moved items still under `current` are re-filed (units convert
 * back, and get their exact old amounts), the rows a unit change merged are split again, and `current` is removed when
 * the change created it, unless an item is filed under it since (`keptCurrent`). Returns null and changes nothing when
 * `current` is gone (renamed or deleted since), so no item is left under a name that no longer exists. A merge that can
 * no longer be split (a row gone since, or one with the same name and unit added) refuses the whole Undo.
 */
export async function revertShoppingCategory(userId: string, input: RevertShoppingCategoryInput, kind: ShoppingKind = "category") {
  const { name, current, sortOrder, itemIds, dropCurrent, merges, amounts } = input;
  const { table, fallback, column } = DIMS[kind];
  const list = eq(table.userId, userId);
  return db.transaction(async (tx): Promise<{ keptCurrent: boolean } | null> => {
    await lockShopping(tx, userId);
    if (current !== fallback && (await tx.select().from(table).where(ownCategory(userId, current, kind))).length === 0) return null;
    const [back] = await tx.select().from(table).where(ownCategory(userId, name, kind));
    if (!back) {
      const [taken] = await tx.select().from(table).where(and(list, eq(table.sortOrder, sortOrder))).limit(1);
      if (taken) await tx.update(table).set({ sortOrder: sql`${table.sortOrder} + 1` }).where(and(list, gte(table.sortOrder, sortOrder)));
      await tx.insert(table).values({ userId, name, sortOrder }).onConflictDoNothing();
    }
    for (const m of merges) {
      const [merged] = await tx
        .update(shoppingItems)
        .set({ clearedAt: null })
        .where(and(eq(shoppingItems.id, m.id), eq(shoppingItems.userId, userId), isNotNull(shoppingItems.clearedAt)))
        .returning();
      const [into] = merged
        ? await tx
            .update(shoppingItems)
            .set({ amount: m.amount.toFixed(2), category: m.category, isBought: m.isBought })
            .where(and(eq(shoppingItems.id, m.into), eq(shoppingItems.userId, userId)))
            .returning()
        : [];
      // The split row must not land on a row with its name and unit, added since.
      const [twin] = merged
        ? await tx
            .select({ id: shoppingItems.id })
            .from(shoppingItems)
            .where(and(onList(userId), ne(shoppingItems.id, merged.id), sql`lower(${shoppingItems.name}) = lower(${merged.name})`, eq(shoppingItems.unit, merged.unit)))
            .limit(1)
        : [];
      if (!into || twin) throw new Refusal(`Can't undo: "${current}" has changed since.`);
    }
    // A merge's target was under `current` before the change, so it stays there.
    const into = new Set(merges.map((m) => m.into));
    const moved = itemIds.filter((id) => !into.has(id));
    if (moved.length > 0) await moveShoppingItems(tx, userId, current, name, kind, moved, new Map(amounts.map((a) => [a.id, a.amount])));
    // Never the name just put back: a revert that names the same one twice must not delete it.
    if (!dropCurrent || current === fallback || current === name) return { keptCurrent: false };
    const [used] = await tx.select({ id: shoppingItems.id }).from(shoppingItems).where(and(eq(shoppingItems.userId, userId), eq(column, current))).limit(1);
    if (used) return { keptCurrent: true };
    await tx.delete(table).where(ownCategory(userId, current, kind));
    return { keptCurrent: false };
  });
}

/** Ticks or unticks an item. Undo sends the time the box had before (`checkedAt`), so the row goes back to its place. */
export async function toggleShoppingItem(userId: string, itemId: string, isBought: boolean, checkedAt?: Date | null) {
  const [updated] = await db
    .update(shoppingItems)
    .set({ isBought, checkedAt: checkedAt === undefined ? new Date() : checkedAt })
    .where(and(eq(shoppingItems.id, itemId), onList(userId)))
    .returning();

  return updated;
}

/** Takes an item off the list; the row stays (until the next Clear bought) so Undo (restoreShoppingItems) brings it back exactly, bought state included. */
export async function deleteShoppingItem(userId: string, itemId: string) {
  const [deleted] = await db
    .update(shoppingItems)
    .set({ clearedAt: new Date() })
    .where(and(eq(shoppingItems.id, itemId), onList(userId)))
    .returning();

  return deleted;
}

/**
 * Takes the given bought items off the list (only those: the screen may show fewer than the server holds); they stay
 * in the table so Undo can restore them. Only this batch stays (D-042): every row taken off the list before it (an
 * earlier batch, a deleted or merged item) is deleted for good.
 */
export async function clearBoughtShoppingItems(userId: string, itemIds: string[]) {
  return db.transaction(async (tx) => {
    await lockShopping(tx, userId);
    const cleared = await tx
      .update(shoppingItems)
      .set({ clearedAt: new Date() })
      .where(and(onList(userId), eq(shoppingItems.isBought, true), inArray(shoppingItems.id, itemIds)))
      .returning();
    if (cleared.length > 0)
      await tx
        .delete(shoppingItems)
        .where(and(eq(shoppingItems.userId, userId), isNotNull(shoppingItems.clearedAt), notInArray(shoppingItems.id, cleared.map((c) => c.id))));
    return cleared;
  });
}

/**
 * Undoes a delete or a clear: puts the user's items back on the list. An item whose name and unit are on the list
 * again (added since) merges into that row instead (D-042), which takes its category; a sum past the cap refuses the
 * whole Undo. Answers the rows now on the list and how many merged.
 */
export async function restoreShoppingItems(userId: string, itemIds: string[]) {
  return db.transaction(async (tx) => {
    await lockShopping(tx, userId);
    const rows = await tx.select().from(shoppingItems).where(and(eq(shoppingItems.userId, userId), inArray(shoppingItems.id, itemIds)));
    const live = await tx.select().from(shoppingItems).where(onList(userId));
    const byKey = new Map(live.map((r) => [itemKey(r), r]));
    const items = new Map<string, typeof shoppingItems.$inferSelect>();
    const back: string[] = [];
    let merged = 0;
    for (const row of rows) {
      const same = byKey.get(itemKey(row));
      if (row.clearedAt === null || !same) {
        back.push(row.id);
        byKey.set(itemKey(row), row);
        continue;
      }
      const amount = round2(Number(same.amount) + Number(row.amount));
      if (amount > MAX_SHOPPING_AMOUNT) throw tooMuch(same.name, amount, same.unit);
      const [into] = await tx
        .update(shoppingItems)
        .set({ amount: amount.toFixed(2), category: row.category, isBought: same.isBought && row.isBought })
        .where(eq(shoppingItems.id, same.id))
        .returning();
      byKey.set(itemKey(into), into);
      items.set(into.id, into);
      merged++;
    }
    if (back.length > 0)
      for (const row of await tx.update(shoppingItems).set({ clearedAt: null }).where(inArray(shoppingItems.id, back)).returning()) items.set(row.id, row);
    return { items: [...items.values()], merged };
  });
}

const weightColumns = {
  id: weightEntries.id,
  date: weightEntries.date,
  kilograms: weightEntries.kilograms,
};

/** Every weigh-in is kept forever; `since` only limits what a page reads. */
export async function listWeightEntries(userId: string, since?: string) {
  return db
    .select(weightColumns)
    .from(weightEntries)
    .where(and(eq(weightEntries.userId, userId), since ? gte(weightEntries.date, since) : undefined))
    .orderBy(desc(weightEntries.date));
}

/**
 * Sets the day's weight: creates the weigh-in, or changes the one the day already has. `previous` is that earlier row,
 * or null when this save created the day. A save carries the fresh id the device made (D-040): a repeat of it, once the
 * day holds that row, answers the row unchanged. An id another weigh-in already holds (another user's, or one of the
 * caller's other days) writes nothing and answers `entry: null`, whether or not the day has a weigh-in yet.
 */
export async function saveWeightEntry(userId: string, input: LogWeightInput) {
  const kilograms = input.kilograms.toFixed(2);
  return db.transaction(async (tx) => {
    await lockUser(tx, "weight", userId); // two saves of a new day at once must not both insert
    const [previous] = await tx
      .select(weightColumns)
      .from(weightEntries)
      .where(and(eq(weightEntries.userId, userId), eq(weightEntries.date, input.date)));
    if (!previous) {
      const inserted = await tx
        .insert(weightEntries)
        .values({ id: input.id, userId, date: input.date, kilograms })
        .onConflictDoNothing()
        .returning(weightColumns);
      // Nothing inserted: another weigh-in holds the id (the day has none here), so nothing is answered.
      return { entry: inserted.at(0) ?? null, previous: null };
    }
    if (input.id === previous.id) return { entry: previous, previous: null };
    if (input.id) {
      // An edit carries a fresh id (D-040); one another weigh-in already holds (any user's, any day) is refused.
      const [taken] = await tx.select({ id: weightEntries.id }).from(weightEntries).where(eq(weightEntries.id, input.id));
      if (taken) return { entry: null, previous: null };
    }
    const [entry] = await tx
      .update(weightEntries)
      .set({ kilograms })
      .where(and(eq(weightEntries.id, previous.id), eq(weightEntries.userId, userId)))
      .returning(weightColumns);
    return { entry, previous };
  });
}

export async function deleteWeightEntry(userId: string, id: string) {
  const [deleted] = await db
    .delete(weightEntries)
    .where(and(eq(weightEntries.id, id), eq(weightEntries.userId, userId)))
    .returning({ id: weightEntries.id });
  return deleted;
}

/** Undo of a delete: the weigh-in comes back under its old id. A taken id or day gives back undefined. */
export async function restoreWeightEntry(userId: string, input: RestoreWeightInput) {
  const [restored] = await db
    .insert(weightEntries)
    .values({ id: input.id, userId, date: input.date, kilograms: input.kilograms.toFixed(2) })
    .onConflictDoNothing()
    .returning(weightColumns);
  return restored;
}
