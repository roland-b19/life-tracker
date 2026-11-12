import { and, asc, eq, gte, lt, lte, notExists, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import { pushSubscriptions, todoDayStats, todos } from "@/db/schema";
import { ensureCategory } from "./categories";
import { addDays, APP_TZ, appDay, toISODate } from "./format-date";
import { compareTodos } from "./todo-order";
import {
  CreateTodoInput,
  PushSubscriptionInput,
  RestoreTodoInput,
  restoreTodoSchema,
  TodoSpace,
  ToggleTodoInput,
  UpdateTodoInput,
} from "./validations/todos";

export interface TodoItem {
  id: string;
  userId: string;
  space: TodoSpace;
  title: string;
  isRecurring: boolean;
  recurrencePattern: string;
  dueDate: string;
  reminderTime: string | null;
  isCompleted: boolean;
  /** When the box last changed on the day asked for (ticked or unticked); null if it never did that day. */
  completedAt: Date | null;
  isCarriedOver: boolean;
  category: string;
  /** When the task last took its place in a list: the newest is on top. */
  placedAt: Date;
  createdAt: Date;
}

export interface TodoStats {
  total: number;
  completed: number;
  percentage: number;
}

export interface DailyTodosResult {
  todos: TodoItem[];
  stats: TodoStats;
}

// The same table again, to compare a task with the others on its list.
const other = alias(todos, "other");

/** Repeating tasks due on `day`: every day from their first day (dueDate) on. */
const repeatsOn = (day: string) => and(eq(todos.isRecurring, true), lte(todos.dueDate, day));

/** Tasks due on `day`: one-off tasks planned for it, and repeating tasks (whose dueDate is only their first day). */
const dueOn = (day: string) => or(and(eq(todos.isRecurring, false), eq(todos.dueDate, day)), repeatsOn(day));

/** Whether a task counts as done on `day`: a repeating one only if it was ticked that day, so every day starts open. */
const isDoneOn = (t: { isRecurring: boolean; isCompleted: boolean; completedAt: Date | null }, day: string) =>
  t.isCompleted && (!t.isRecurring || (t.completedAt !== null && appDay(t.completedAt) === day));

/** A repeating task without a usable pattern repeats every day. */
const patternFor = (isRecurring: boolean, pattern: string) => (!isRecurring ? "none" : pattern === "none" ? "daily" : pattern);

export async function getDailyTodos(
  userId: string,
  space: TodoSpace,
  targetDate: string,
  today = toISODate(),
): Promise<DailyTodosResult> {
  // 1. Rollover: carry unfinished one-off tasks from past dates to today.
  // Never when reading a past day (it shows that day as it was), and never into a future day being planned:
  // an overdue task belongs to today, not to whatever day is on screen. One that today already has
  // (same title, one-off; a daily task of that name is another list) stays on its own day, so the rollover never makes a duplicate.
  // A task added to a day that was already over (dev builds) stays on that day.
  // shortcut: two overdue tasks with one title both roll over together, dedupe them here if that shows up.
  if (targetDate >= today) await db
    .update(todos)
    .set({
      dueDate: today,
      isCarriedOver: true,
      placedAt: new Date(), // carried tasks land on top; whatever is added or moved later goes above them
    })
    .where(
      and(
        eq(todos.userId, userId),
        eq(todos.space, space),
        eq(todos.isRecurring, false),
        eq(todos.isCompleted, false),
        lt(todos.dueDate, today),
        // Midnight in the app's timezone (the same one toISODate uses), not the database session's (UTC).
        sql`${todos.createdAt} < ((${todos.dueDate} + 1)::timestamp at time zone ${APP_TZ})`,
        notExists(
          db
            .select({ id: other.id })
            .from(other)
            .where(
              and(
                eq(other.userId, userId),
                eq(other.space, space),
                sql`lower(${other.title}) = lower(${todos.title})`,
                and(eq(other.isRecurring, false), eq(other.dueDate, today)),
              ),
            ),
        ),
      ),
    );

  // 2. Fetch all tasks relevant for targetDate: one-off tasks with dueDate = targetDate, and repeating tasks due that day.
  const rows = await db.select().from(todos).where(and(eq(todos.userId, userId), eq(todos.space, space), dueOn(targetDate)));
  const items: TodoItem[] = rows.map((r) => ({
    ...r,
    space: r.space as TodoSpace,
    isCompleted: isDoneOn(r, targetDate),
    // A repeating task's box change only orders the day it happened on; a task unticked that day stays at the bottom of the open ones.
    completedAt: r.isRecurring && r.completedAt && appDay(r.completedAt) !== targetDate ? null : r.completedAt,
  })).sort(compareTodos);

  const total = items.length;
  const completed = items.filter((t) => t.isCompleted).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 100; // nothing due = all done

  return {
    todos: items,
    stats: {
      total,
      completed,
      percentage,
    },
  };
}

export interface TodoDayStat {
  date: string;
  isRecurring: boolean;
  total: number;
  done: number;
}

/** Freezes how many tasks of one kind (daily / one-off) existed and were done on `date`: the only trace of a day once its tasks are deleted. */
async function recordDayStats(userId: string, space: TodoSpace, isRecurring: boolean, date: string): Promise<void> {
  const [{ total, done }] = await db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${todos.isCompleted} and (not ${todos.isRecurring} or (${todos.completedAt} at time zone ${APP_TZ})::date = ${date}::date))::int`,
    })
    .from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.space, space), isRecurring ? repeatsOn(date) : and(eq(todos.isRecurring, false), eq(todos.dueDate, date))));
  await db
    .insert(todoDayStats)
    .values({ userId, space, isRecurring, date, total, done })
    .onConflictDoUpdate({
      target: [todoDayStats.userId, todoDayStats.space, todoDayStats.isRecurring, todoDayStats.date],
      set: { total, done },
    });
}

export async function getTodoHistory(userId: string, space: TodoSpace, days = 90): Promise<TodoDayStat[]> {
  return db
    .select({
      date: todoDayStats.date,
      isRecurring: todoDayStats.isRecurring,
      total: todoDayStats.total,
      done: todoDayStats.done,
    })
    .from(todoDayStats)
    .where(
      and(
        eq(todoDayStats.userId, userId),
        eq(todoDayStats.space, space),
        gte(todoDayStats.date, addDays(toISODate(), -days + 1)),
        sql`${todoDayStats.total} > 0`,
      ),
    )
    .orderBy(asc(todoDayStats.date));
}

/**
 * Whether the list a task would join already has another one with the same title (any case), in its own space:
 * a one-off task meets the one-off tasks of its day, a repeating (Daily) task the other Daily tasks.
 * `exceptId` is the task itself (rename, move, restore).
 * shortcut: two adds racing can both pass, add a unique index if that ever matters.
 */
export async function hasDuplicateTodo(
  userId: string,
  task: Pick<CreateTodoInput, "title" | "isRecurring" | "dueDate"> & { space: string },
  exceptId?: string | string[],
): Promise<boolean> {
  const [row] = await db
    .select({ id: todos.id })
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        eq(todos.space, task.space),
        sql`lower(${todos.title}) = lower(${task.title})`,
        exceptId ? notInArray(todos.id, [exceptId].flat()) : undefined,
        // Daily and Today never meet: a daily task only meets the other daily ones, a one-off only the one-offs of its day.
        task.isRecurring
          ? eq(todos.isRecurring, true)
          : and(eq(todos.isRecurring, false), eq(todos.dueDate, task.dueDate)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** The user's task, or undefined. */
export async function findTodo(userId: string, todoId: string) {
  const [row] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
  return row;
}

export async function createTodo(userId: string, input: CreateTodoInput): Promise<TodoItem> {
  const isRecurring = Boolean(input.isRecurring);
  const recurrencePattern = patternFor(isRecurring, input.recurrencePattern);

  const [created] = await db
    .insert(todos)
    .values({
      userId,
      space: input.space,
      title: input.title,
      isRecurring,
      recurrencePattern,
      dueDate: input.dueDate,
      reminderTime: input.reminderTime ?? null,
      isCompleted: false,
      isCarriedOver: false,
      category: input.category ?? "other",
    })
    .returning();

  await ensureCategory(userId, input.space, created.category);
  await recordDayStats(userId, input.space, isRecurring, isRecurring ? toISODate() : input.dueDate);

  return { ...created, space: created.space as TodoSpace };
}

/** Puts a deleted task back as it was. An id that is already taken is left alone and returns null. */
export async function restoreTodo(userId: string, rawInput: RestoreTodoInput): Promise<TodoItem | null> {
  const input = restoreTodoSchema.parse(rawInput);
  const [restored] = await db
    .insert(todos)
    .values({
      id: input.id,
      userId,
      space: input.space,
      title: input.title,
      isRecurring: input.isRecurring,
      recurrencePattern: patternFor(input.isRecurring, input.recurrencePattern),
      dueDate: input.dueDate,
      reminderTime: input.reminderTime ?? null,
      isCompleted: input.isCompleted,
      completedAt: input.completedAt ?? (input.isCompleted ? new Date() : null),
      isCarriedOver: input.isCarriedOver,
      category: input.category,
      createdAt: input.createdAt,
      placedAt: input.placedAt ?? input.createdAt,
    })
    .onConflictDoNothing()
    .returning();
  if (!restored) return null;

  const space = restored.space as TodoSpace;
  await ensureCategory(userId, space, restored.category);
  await recordDayStats(userId, space, restored.isRecurring, restored.isRecurring ? toISODate() : restored.dueDate);
  return { ...restored, space };
}

export async function toggleTodo(userId: string, input: ToggleTodoInput): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, input.id), eq(todos.userId, userId)));

  if (!existing) {
    return false;
  }

  // A repeating task is ticked for today only: isDoneOn reads the tick as open again from tomorrow.
  await db
    .update(todos)
    .set({
      isCompleted: input.isCompleted,
      completedAt: new Date(), // when the box last changed: orders the list
    })
    .where(eq(todos.id, existing.id));

  // A one-off task counts on its own day, whichever day it was ticked from.
  await recordDayStats(userId, existing.space as TodoSpace, existing.isRecurring, existing.isRecurring ? toISODate() : existing.dueDate);
  return true;
}

/** Edits a task in place. Null when the task is not the user's. */
export async function updateTodo(userId: string, input: UpdateTodoInput): Promise<TodoItem | null> {
  const task = await findTodo(userId, input.id);
  if (!task) return null;
  const changes = { title: input.title, reminderTime: input.reminderTime ?? null, ...(input.category && { category: input.category }) };
  const [row] = await db.update(todos).set(changes).where(eq(todos.id, task.id)).returning();
  const space = row.space as TodoSpace;
  if (input.category) await ensureCategory(userId, space, input.category);
  return { ...row, space };
}

/**
 * Deletes a task for good: nothing of it stays but the day's counts in todo_day_stats, which the charts read.
 * Undo inserts it again from the screen's copy. Null when the task is not the user's.
 */
export async function deleteTodo(userId: string, todoId: string): Promise<true | null> {
  const task = await findTodo(userId, todoId);
  if (!task) return null;
  await db.delete(todos).where(and(eq(todos.id, task.id), eq(todos.userId, userId)));
  await recordDayStats(userId, task.space as TodoSpace, task.isRecurring, task.isRecurring ? toISODate() : task.dueDate);
  return true;
}

export async function savePushSubscription(
  userId: string,
  input: PushSubscriptionInput,
) {
  // One row per endpoint: re-enabling reminders (or a double tap) must not send every reminder twice.
  return db.transaction(async (tx) => {
    await tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, input.endpoint)));
    const [created] = await tx
      .insert(pushSubscriptions)
      .values({ userId, endpoint: input.endpoint, p256dhKey: input.p256dhKey, authKey: input.authKey })
      .returning();
    return created;
  });
}


/** Removes the user's own subscription for this push endpoint (Undo of enabling reminders). */
export async function removePushSubscription(userId: string, endpoint: string): Promise<boolean> {
  const gone = await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .returning({ id: pushSubscriptions.id });
  return gone.length > 0;
}
