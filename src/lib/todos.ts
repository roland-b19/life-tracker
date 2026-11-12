import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, notExists, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import { pushSubscriptions, todoCompletions, todoDayStats, todos } from "@/db/schema";
import { ensureCategory } from "./categories";
import { addDays, APP_TZ, appDay, toISODate } from "./format-date";
import { streakOn } from "./streak";
import { compareTodos } from "./todo-order";
import { endTodo, splitTodo } from "./todo-split";
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
  category: string;
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
 * Repeating tasks due on `day`: every day from their first day (dueDate) on, unless the task was deleted on or
 * before `day`.
 */
const repeatsOn = (day: string, t: DueColumns = todos) =>
  and(
    eq(t.isRecurring, true),
    lte(t.dueDate, day),
    or(isNull(t.endedOn), gt(t.endedOn, day)),
  );

/** Tasks due on `day`: one-off tasks planned for it, and repeating tasks (whose dueDate is only their first day). */
const dueOn = (day: string, t: DueColumns = todos) => or(and(eq(t.isRecurring, false), eq(t.dueDate, day)), repeatsOn(day, t));

/** A repeating task without a usable pattern repeats every day. */
const patternFor = (isRecurring: boolean, pattern: string) => (!isRecurring ? "none" : pattern === "none" ? "daily" : pattern);

/** Days of tick history a screen loads per repeating task; the streak and Undo cannot see further back. */
// shortcut: a streak longer than this reads as this many days, raise it if a streak ever gets there.
export const DONE_DATES_WINDOW_DAYS = 400;

/** Each repeating task's ticked days, oldest first; only those on or after `since` when given. */
async function doneDatesOf(ids: string[], since?: string): Promise<Map<string, string[]>> {
  const byTask = new Map<string, string[]>(ids.map((id) => [id, []]));
  if (!ids.length) return byTask;
  const rows = await db
    .select()
    .from(todoCompletions)
    .where(and(inArray(todoCompletions.todoId, ids), since ? gte(todoCompletions.date, since) : undefined))
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
  const dueToday = and(eq(todos.userId, userId), eq(todos.space, space), dueOn(targetDate));
  // The ticked days are read in the same round trip as the tasks (by sub-select) instead of after them.
  const [rows, doneRows] = await Promise.all([
    db.select().from(todos).where(dueToday),
    db
      .select()
      .from(todoCompletions)
      .where(
        and(
          inArray(todoCompletions.todoId, db.select({ id: todos.id }).from(todos).where(and(dueToday, eq(todos.isRecurring, true)))),
          gte(todoCompletions.date, addDays(targetDate, -DONE_DATES_WINDOW_DAYS)),
        ),
      )
      .orderBy(asc(todoCompletions.date)),
  ]);
  const done = new Map<string, string[]>();
  for (const r of doneRows) done.set(r.todoId, [...(done.get(r.todoId) ?? []), r.date]);
  const items: TodoItem[] = rows.map((r) => {
    const doneDates = done.get(r.id) ?? [];
    const isCompleted = r.isRecurring ? doneDates.includes(targetDate) : r.isCompleted;
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
      isCompleted,
      // An unticked task sits at the bottom of its list for the day it was unticked, no longer.
      completedAt: isCompleted || (r.completedAt && appDay(r.completedAt) === targetDate) ? r.completedAt : null,
      isCarriedOver: r.isCarriedOver,
      category: r.category,
      streak: r.isRecurring ? streakOn(new Set(doneDates), targetDate) : 0,
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
      category: input.category ?? "other",
    })
    .returning();

  await ensureCategory(userId, input.space, created.category);
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
          completedAt: input.isCompleted ? input.completedAt ?? new Date() : null,
          isCarriedOver: input.isCarriedOver,
          category: input.category,
          createdAt: input.createdAt,
        })
        .onConflictDoNothing()
        .returning();
  if (!restored) return null;

  await ensureCategory(userId, restored.space as TodoSpace, restored.category);
  const doneDates = input.isRecurring ? [...new Set(input.doneDates)].sort() : [];
  if (doneDates.length) {
    await db.insert(todoCompletions).values(doneDates.map((date) => ({ todoId: restored.id, date }))).onConflictDoNothing();
  }
  const today = toISODate();
  await recordDayStats(userId, restored.space as TodoSpace, restored.isRecurring ? today : restored.dueDate);
  const streak = restored.isRecurring ? streakOn(new Set(doneDates), today) : 0;
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
    } else {
      await db
        .delete(todoCompletions)
        .where(and(eq(todoCompletions.todoId, day.todoId), eq(todoCompletions.date, day.date)));
    }
    await db.update(todos).set({ completedAt: new Date() }).where(eq(todos.id, existing.id));
  } else {
    // One-off task
    await db
      .update(todos)
      .set({
        isCompleted: input.isCompleted,
        completedAt: new Date(), // when the box last changed: orders the list
      })
      .where(eq(todos.id, existing.id));
  }

  // A one-off task counts on its own day, whichever day it was ticked from.
  await recordDayStats(userId, existing.space as TodoSpace, existing.isRecurring ? input.currentDate : existing.dueDate);
  return true;
}

/**
 * Edits a task. A repeating task with days before `day` (default today) is edited from `day` on and keeps those days
 * as they were (splitTodo), so the task now on `day` can be a new one. Null when the task is not the user's.
 */
export async function updateTodo(userId: string, input: UpdateTodoInput, day = toISODate()): Promise<TodoItem | null> {
  const task = await findTodo(userId, input.id);
  if (!task) return null;
  const changes = { title: input.title, reminderTime: input.reminderTime ?? null, ...(input.category && { category: input.category }) };
  const row = hasPast(task, day)
    ? await db.transaction((tx) => splitTodo(tx, task, day, changes))
    : (await db.update(todos).set(changes).where(eq(todos.id, task.id)).returning())[0];
  const space = row.space as TodoSpace;
  if (input.category) await ensureCategory(userId, space, input.category);
  const doneDates = row.isRecurring ? (await doneDatesOf([row.id])).get(row.id) ?? [] : [];
  return { ...row, space, streak: row.isRecurring ? streakOn(new Set(doneDates), day) : 0, doneDates };
}

/** Whether a task is a repeating one that was already part of days before `day`. */
const hasPast = (task: { isRecurring: boolean; dueDate: string }, day: string) => task.isRecurring && task.dueDate < day;

/**
 * Moves a task to another day, or turns it into a repeating task or back into a one-off one, with any edits made in the
 * same step. It starts fresh there: not done, not carried over, no streak. A repeating task with days before `from`
 * (the day on screen, default today) that becomes a one-off ends on `from` and a new one-off task takes its place,
 * so those days keep it. Null when the task is not the user's.
 */
export async function moveTodo(userId: string, input: MoveTodoInput, from = toISODate()): Promise<TodoItem | null> {
  const [before] = await db
    .select()
    .from(todos)
    .where(and(eq(todos.id, input.id), eq(todos.userId, userId)));
  if (!before) return null;

  const isRecurring = input.recurrencePattern !== "none";
  const space = before.space as TodoSpace;
  const today = toISODate();
  const next = {
    title: input.title ?? before.title,
    reminderTime: input.reminderTime === undefined ? before.reminderTime : input.reminderTime,
    category: input.category ?? before.category,
  };
  if (!isRecurring && hasPast(before, from)) {
    await endTodo(db, userId, before.id, from);
    const created = await createTodo(userId, {
      space,
      isRecurring: false,
      recurrencePattern: "none",
      dueDate: input.dueDate,
      ...next,
    });
    await recordDayStats(userId, space, from);
    return created;
  }
  const [moved] = await db
    .update(todos)
    .set({
      ...next,
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
  await ensureCategory(userId, space, next.category);

  // The day it left and the day it joined both count again.
  for (const day of new Set([before.isRecurring ? today : before.dueDate, isRecurring ? today : input.dueDate])) {
    await recordDayStats(userId, space, day);
  }
  return { ...moved, space, streak: 0, doneDates: [] };
}

/**
 * Undoes a move: the task goes back to the state it was in (ticked days included), and the task the move created
 * in its place, if any, is deleted. Null when the snapshot cannot be put back.
 */
export async function revertMoveTodo(userId: string, rawInput: RestoreTodoInput, createdId?: string): Promise<TodoItem | null> {
  const input = restoreTodoSchema.parse(rawInput);
  const created = createdId && createdId !== input.id ? await findTodo(userId, createdId) : undefined;
  const existing = await findTodo(userId, input.id);
  if (!existing && !created) return restoreTodo(userId, input);
  if (created) await db.delete(todos).where(and(eq(todos.id, created.id), eq(todos.userId, userId)));
  if (!existing) return restoreTodo(userId, input);

  const [back] = await db
    .update(todos)
    .set({
      space: input.space,
      title: input.title,
      isRecurring: input.isRecurring,
      recurrencePattern: patternFor(input.isRecurring, input.recurrencePattern),
      dueDate: input.dueDate,
      reminderTime: input.reminderTime ?? null,
      isCompleted: input.isCompleted,
      completedAt: input.isCompleted ? input.completedAt ?? new Date() : null,
      isCarriedOver: input.isCarriedOver,
      category: input.category,
      endedOn: null,
    })
    .where(and(eq(todos.id, input.id), eq(todos.userId, userId)))
    .returning();
  await db.delete(todoCompletions).where(eq(todoCompletions.todoId, input.id));
  const doneDates = input.isRecurring ? [...new Set(input.doneDates)].sort() : [];
  if (doneDates.length) await db.insert(todoCompletions).values(doneDates.map((date) => ({ todoId: input.id, date })));
  await ensureCategory(userId, input.space, back.category);
  // Every day the move or its undo touched counts again.
  const today = toISODate();
  const days = new Set([today, input.dueDate, existing.dueDate, ...(created ? [created.dueDate] : [])]);
  for (const day of days) await recordDayStats(userId, input.space, day);
  return { ...back, space: input.space, streak: input.isRecurring ? streakOn(new Set(doneDates), today) : 0, doneDates };
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
    await endTodo(db, userId, task.id, from);
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
