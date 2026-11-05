import { and, asc, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { pushSubscriptions, todoDayStats, todos } from "@/db/schema";
import { toISODate } from "./format-date";
import { applyToggle, liveStreak } from "./streak";
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
  completedAt: Date | null;
  isCarriedOver: boolean;
  streak: number;
  lastCompletedDate: string | null;
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

export async function getDailyTodos(
  userId: string,
  space: TodoSpace,
  targetDate: string,
  today = toISODate(),
): Promise<DailyTodosResult> {
  // 1. Rollover: carry unfinished one-off tasks from past dates to today.
  // Never when reading a past day (read-only), and never into a future day being planned:
  // an overdue task belongs to today, not to whatever day is on screen.
  if (targetDate >= today) await db
    .update(todos)
    .set({
      dueDate: today,
      isCarriedOver: true,
    })
    .where(
      and(
        eq(todos.userId, userId),
        eq(todos.space, space),
        eq(todos.isRecurring, false),
        eq(todos.isCompleted, false),
        lt(todos.dueDate, today),
      ),
    );

  // 2. Fetch all tasks relevant for targetDate:
  // - one-off tasks with dueDate = targetDate
  // - recurring daily tasks
  const rows = await db
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        eq(todos.space, space),
        or(
          eq(todos.dueDate, targetDate),
          and(eq(todos.isRecurring, true), eq(todos.recurrencePattern, "daily")),
        ),
      ),
    )
    .orderBy(asc(todos.isCompleted), desc(todos.isCarriedOver), asc(todos.createdAt));

  const items: TodoItem[] = rows.map((r) => {
    let completed = r.isCompleted;
    if (r.isRecurring) {
      // For recurring tasks, completion is scoped to whether it was completed on targetDate
      completed = r.lastCompletedDate === targetDate;
    }

    return {
      id: r.id,
      userId: r.userId,
      space: r.space as TodoSpace,
      title: r.title,
      isRecurring: r.isRecurring,
      recurrencePattern: r.recurrencePattern,
      dueDate: r.dueDate,
      reminderTime: r.reminderTime,
      isCompleted: completed,
      completedAt: r.completedAt,
      isCarriedOver: r.isCarriedOver,
      // A stored streak whose last tick is older than yesterday is already broken.
      streak: r.isRecurring ? liveStreak(r, targetDate) : r.streak,
      lastCompletedDate: r.lastCompletedDate,
      createdAt: r.createdAt,
    };
  });

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

/** Freezes how many tasks existed and were done on `date`, one row per kind (daily / one-off). */
async function recordDayStats(userId: string, space: TodoSpace, date: string): Promise<void> {
  const rows = await db
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        eq(todos.space, space),
        or(eq(todos.dueDate, date), and(eq(todos.isRecurring, true), eq(todos.recurrencePattern, "daily"))),
      ),
    );

  for (const isRecurring of [true, false]) {
    const kind = rows.filter((r) => r.isRecurring === isRecurring);
    const total = kind.length;
    const done = kind.filter((r) => (isRecurring ? r.lastCompletedDate === date : r.isCompleted)).length;
    await db
      .insert(todoDayStats)
      .values({ userId, space, isRecurring, date, total, done })
      .onConflictDoUpdate({
        target: [todoDayStats.userId, todoDayStats.space, todoDayStats.isRecurring, todoDayStats.date],
        set: { total, done },
      });
  }
}

export async function getTodoHistory(userId: string, space: TodoSpace, days = 90): Promise<TodoDayStat[]> {
  const since = new Date();
  since.setDate(since.getDate() - days + 1);
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
        gte(todoDayStats.date, toISODate(since)),
        sql`${todoDayStats.total} > 0`,
      ),
    )
    .orderBy(asc(todoDayStats.date));
}

export async function createTodo(userId: string, input: CreateTodoInput): Promise<TodoItem> {
  const isRecurring = Boolean(input.isRecurring);
  const recurrencePattern = isRecurring
    ? input.recurrencePattern === "none"
      ? "daily"
      : input.recurrencePattern
    : "none";

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
      streak: 0,
    })
    .returning();

  await recordDayStats(userId, input.space, isRecurring ? toISODate() : input.dueDate);

  return {
    ...created,
    space: created.space as TodoSpace,
  };
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
      recurrencePattern: input.isRecurring ? "daily" : "none",
      dueDate: input.dueDate,
      reminderTime: input.reminderTime ?? null,
      isCompleted: input.isCompleted,
      completedAt: input.isCompleted ? new Date() : null,
      isCarriedOver: input.isCarriedOver,
      streak: input.streak,
      lastCompletedDate: input.lastCompletedDate,
      createdAt: input.createdAt,
    })
    .onConflictDoNothing()
    .returning();
  if (!restored) return null;

  await recordDayStats(userId, input.space, input.isRecurring ? toISODate() : input.dueDate);
  return { ...restored, space: restored.space as TodoSpace };
}

export async function toggleTodo(userId: string, input: ToggleTodoInput): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, input.id), eq(todos.userId, userId)));

  if (!existing) {
    return false;
  }

  if (existing.isRecurring) {
    const before = { streak: existing.streak ?? 0, lastCompletedDate: existing.lastCompletedDate };
    const next = applyToggle(before, input.isCompleted, input.currentDate);
    const done = next.lastCompletedDate === input.currentDate;
    if (next !== before) {
      await db
        .update(todos)
        .set({ ...next, isCompleted: done, completedAt: done ? new Date() : null })
        .where(eq(todos.id, existing.id));
    }
  } else {
    // One-off task
    await db
      .update(todos)
      .set({
        isCompleted: input.isCompleted,
        completedAt: input.isCompleted ? new Date() : null,
      })
      .where(eq(todos.id, existing.id));
  }

  // A one-off task counts on its own day, whichever day it was ticked from.
  await recordDayStats(userId, existing.space as TodoSpace, existing.isRecurring ? input.currentDate : existing.dueDate);
  return true;
}

export async function updateTodo(userId: string, input: UpdateTodoInput): Promise<boolean> {
  const updated = await db
    .update(todos)
    .set({ title: input.title, reminderTime: input.reminderTime ?? null })
    .where(and(eq(todos.id, input.id), eq(todos.userId, userId)))
    .returning({ id: todos.id });

  return updated.length > 0;
}

export async function deleteTodo(userId: string, todoId: string): Promise<boolean> {
  const deleted = await db
    .delete(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
    .returning({ id: todos.id, space: todos.space, isRecurring: todos.isRecurring, dueDate: todos.dueDate });

  if (deleted[0]) {
    const { space, isRecurring, dueDate } = deleted[0];
    await recordDayStats(userId, space as TodoSpace, isRecurring ? toISODate() : dueDate);
  }
  return deleted.length > 0;
}

export async function savePushSubscription(
  userId: string,
  input: PushSubscriptionInput,
) {
  const [created] = await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dhKey: input.p256dhKey,
      authKey: input.authKey,
    })
    .returning();

  return created;
}

