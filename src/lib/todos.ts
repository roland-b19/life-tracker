import { and, asc, eq, gt, gte, inArray, isNull, like, lt, lte, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import { pushSubscriptions, todoCompletions, todoDayStats, todos } from "@/db/schema";
import { addDays, APP_TZ, toISODate } from "./format-date";
import { streakOn, weekdayOf } from "./streak";
import { compareTodos } from "./todo-order";
import {
  CreateTodoInput,
  MoveTodoInput,
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
  /** Repeating tasks only: the run of ticked due days as seen on the day asked for. */
  streak: number;
  /** Repeating tasks only: every day it was ticked, oldest first. */
  doneDates: string[];
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
type DueColumns = typeof todos | typeof other;

/**
 * Repeating tasks due on `day`: every day, or on that day's weekday ("days:1,3,5" holds no other digits),
 * from their first day (dueDate) on, unless the task was deleted on or before `day`.
 */
const repeatsOn = (day: string, t: DueColumns = todos) =>
  and(
    eq(t.isRecurring, true),
    lte(t.dueDate, day),
    or(eq(t.recurrencePattern, "daily"), like(t.recurrencePattern, `days:%${weekdayOf(day)}%`)),
    or(isNull(t.endedOn), gt(t.endedOn, day)),
  );

/** Tasks due on `day`: one-off tasks planned for it, and repeating tasks (whose dueDate is only their first day) due that weekday. */
const dueOn = (day: string, t: DueColumns = todos) => or(and(eq(t.isRecurring, false), eq(t.dueDate, day)), repeatsOn(day, t));

/** A repeating task without a usable pattern repeats every day. */
const patternFor = (isRecurring: boolean, pattern: string) => (!isRecurring ? "none" : pattern === "none" ? "daily" : pattern);

/** Each repeating task's ticked days, oldest first. */
async function doneDatesOf(ids: string[]): Promise<Map<string, string[]>> {
  const byTask = new Map<string, string[]>(ids.map((id) => [id, []]));
  if (!ids.length) return byTask;
  const rows = await db
    .select()
    .from(todoCompletions)
    .where(inArray(todoCompletions.todoId, ids))
    .orderBy(asc(todoCompletions.date));
  for (const r of rows) byTask.get(r.todoId)?.push(r.date);
  return byTask;
}

export async function getDailyTodos(
  userId: string,
  space: TodoSpace,
  targetDate: string,
  today = toISODate(),
): Promise<DailyTodosResult> {
  // 1. Rollover: carry unfinished one-off tasks from past dates to today.
  // Never when reading a past day (it shows that day as it was), and never into a future day being planned:
  // an overdue task belongs to today, not to whatever day is on screen. One that today already has
  // (same title) stays on its own day, so the rollover never makes a duplicate.
  // A task added to a day that was already over (dev builds) stays on that day.
  // shortcut: two overdue tasks with one title both roll over together, dedupe them here if that shows up.
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
                dueOn(today, other),
              ),
            ),
        ),
      ),
    );

  // 2. Fetch all tasks relevant for targetDate:
  // - one-off tasks with dueDate = targetDate
  // - repeating tasks due that day
  const rows = await db
    .select()
    .from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.space, space), dueOn(targetDate)));

  const done = await doneDatesOf(rows.filter((r) => r.isRecurring).map((r) => r.id));
  const items: TodoItem[] = rows.map((r) => {
    const doneDates = done.get(r.id) ?? [];
    return {
      id: r.id,
      userId: r.userId,
      space: r.space as TodoSpace,
      title: r.title,
      isRecurring: r.isRecurring,
      recurrencePattern: r.recurrencePattern,
      dueDate: r.dueDate,
      reminderTime: r.reminderTime,
      // A repeating task is done on the days it was ticked.
      isCompleted: r.isRecurring ? doneDates.includes(targetDate) : r.isCompleted,
      completedAt: r.completedAt,
      isCarriedOver: r.isCarriedOver,
      streak: r.isRecurring ? streakOn(new Set(doneDates), r.recurrencePattern, targetDate) : 0,
      doneDates,
      createdAt: r.createdAt,
    };
  }).sort(compareTodos);

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
        dueOn(date),
      ),
    );
  const ticked = await doneDatesOf(rows.filter((r) => r.isRecurring).map((r) => r.id));

  for (const isRecurring of [true, false]) {
    const kind = rows.filter((r) => r.isRecurring === isRecurring);
    const total = kind.length;
    const done = kind.filter((r) => (isRecurring ? ticked.get(r.id)?.includes(date) : r.isCompleted)).length;
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
 * Whether the list a task would join already has another one with the same title (any case):
 * a one-off task meets what is due that day, a repeating task meets the other repeating tasks
 * and the one-off tasks on its first day. `exceptId` is the task itself (rename, move, restore).
 * shortcut: two adds racing can both pass, add a unique index if that ever matters.
 */
export async function hasDuplicateTodo(
  userId: string,
  task: Pick<CreateTodoInput, "title" | "isRecurring" | "dueDate"> & { space: string },
  exceptId?: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: todos.id })
    .from(todos)
    .where(
      and(
        eq(todos.userId, userId),
        eq(todos.space, task.space),
        sql`lower(${todos.title}) = lower(${task.title})`,
        exceptId ? ne(todos.id, exceptId) : undefined,
        task.isRecurring
          ? or(
              and(eq(todos.isRecurring, true), isNull(todos.endedOn)),
              and(eq(todos.isRecurring, false), eq(todos.dueDate, task.dueDate)),
            )
          : dueOn(task.dueDate),
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
    })
    .returning();

  await recordDayStats(userId, input.space, isRecurring ? toISODate() : input.dueDate);

  return { ...created, space: created.space as TodoSpace, streak: 0, doneDates: [] };
}

/**
 * Puts a deleted task back as it was, ticked days included: a repeating task that was only ended
 * starts again, anything else is inserted again. An id that is already taken is left alone and returns null.
 */
export async function restoreTodo(userId: string, rawInput: RestoreTodoInput): Promise<TodoItem | null> {
  const input = restoreTodoSchema.parse(rawInput);
  const [ended] = await db
    .update(todos)
    .set({ endedOn: null })
    .where(and(eq(todos.id, input.id), eq(todos.userId, userId), sql`${todos.endedOn} is not null`))
    .returning();
  const [restored] = ended
    ? [ended]
    : await db
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
          completedAt: input.isCompleted ? new Date() : null,
          isCarriedOver: input.isCarriedOver,
          createdAt: input.createdAt,
        })
        .onConflictDoNothing()
        .returning();
  if (!restored) return null;

  const doneDates = input.isRecurring ? [...new Set(input.doneDates)].sort() : [];
  if (doneDates.length) {
    await db.insert(todoCompletions).values(doneDates.map((date) => ({ todoId: restored.id, date }))).onConflictDoNothing();
  }
  const today = toISODate();
  await recordDayStats(userId, restored.space as TodoSpace, restored.isRecurring ? today : restored.dueDate);
  const streak = restored.isRecurring ? streakOn(new Set(doneDates), restored.recurrencePattern, today) : 0;
  return { ...restored, space: restored.space as TodoSpace, streak, doneDates };
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
    // Any day can be ticked or unticked, past ones too; the streak is counted from the ticked days.
    const day = { todoId: existing.id, date: input.currentDate };
    if (input.isCompleted) {
      await db.insert(todoCompletions).values(day).onConflictDoNothing();
      await db.update(todos).set({ completedAt: new Date() }).where(eq(todos.id, existing.id));
    } else {
      await db
        .delete(todoCompletions)
        .where(and(eq(todoCompletions.todoId, day.todoId), eq(todoCompletions.date, day.date)));
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
    .returning({ id: todos.id, space: todos.space, isRecurring: todos.isRecurring });

  const [row] = updated;
  if (row?.isRecurring && input.recurrencePattern && input.recurrencePattern !== "none") {
    await db.update(todos).set({ recurrencePattern: input.recurrencePattern }).where(eq(todos.id, row.id));
    await recordDayStats(userId, row.space as TodoSpace, toISODate());
  }
  return updated.length > 0;
}

/** Whether a task is a repeating one that was already part of days before `day`. */
const hasPast = (task: { isRecurring: boolean; dueDate: string }, day: string) => task.isRecurring && task.dueDate < day;

/** Ends a repeating task on `day`: it leaves that day and the days ahead (their ticks go too), the days before keep it. */
async function endTodo(userId: string, todoId: string, day: string): Promise<void> {
  await db.update(todos).set({ endedOn: day }).where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
  await db.delete(todoCompletions).where(and(eq(todoCompletions.todoId, todoId), gte(todoCompletions.date, day)));
}

/**
 * Moves a task to another day, or turns it into a repeating task or back into a one-off one.
 * It starts fresh there: not done, not carried over, no streak. A repeating task with past days
 * that becomes a one-off ends today and a new one-off task takes its place, so those days keep it.
 * Null when the task is not the user's.
 */
export async function moveTodo(userId: string, input: MoveTodoInput): Promise<TodoItem | null> {
  const [before] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, input.id), eq(todos.userId, userId)));
  if (!before) return null;

  const isRecurring = input.recurrencePattern !== "none";
  const space = before.space as TodoSpace;
  const today = toISODate();
  if (!isRecurring && hasPast(before, today)) {
    await endTodo(userId, before.id, today);
    const created = await createTodo(userId, {
      space,
      title: before.title,
      isRecurring: false,
      recurrencePattern: "none",
      dueDate: input.dueDate,
      reminderTime: before.reminderTime,
    });
    await recordDayStats(userId, space, today);
    return created;
  }
  const [moved] = await db
    .update(todos)
    .set({
      isRecurring,
      recurrencePattern: input.recurrencePattern,
      dueDate: input.dueDate,
      isCompleted: false,
      completedAt: null,
      isCarriedOver: false,
    })
    .where(and(eq(todos.id, before.id), eq(todos.userId, userId)))
    .returning();
  await db.delete(todoCompletions).where(eq(todoCompletions.todoId, before.id));

  // The day it left and the day it joined both count again.
  for (const day of new Set([before.isRecurring ? today : before.dueDate, isRecurring ? today : input.dueDate])) {
    await recordDayStats(userId, space, day);
  }
  return { ...moved, space, streak: 0, doneDates: [] };
}

/** Days after `after` that have one-off tasks planned, for the calendar's dots. */
export async function getPlannedDays(userId: string, space: TodoSpace, after: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ day: todos.dueDate })
    .from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.space, space), eq(todos.isRecurring, false), gt(todos.dueDate, after)))
    .orderBy(asc(todos.dueDate));
  return rows.map((r) => r.day);
}

/**
 * Deletes a task. A repeating task with days before `from` (default today) only ends on `from` (endTodo),
 * so those days keep it.
 */
export async function deleteTodo(userId: string, todoId: string, from = toISODate()): Promise<boolean> {
  const task = await findTodo(userId, todoId);
  if (!task) return false;
  const space = task.space as TodoSpace;

  if (hasPast(task, from)) {
    await endTodo(userId, task.id, from);
  } else {
    await db.delete(todos).where(and(eq(todos.id, task.id), eq(todos.userId, userId)));
  }
  await recordDayStats(userId, space, task.isRecurring ? from : task.dueDate);
  return true;
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

