import { and, asc, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/server/db";
import { pushSubscriptions, todos } from "@/db/schema";
import {
  CreateTodoInput,
  PushSubscriptionInput,
  TodoSpace,
  ToggleTodoInput,
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

function getYesterday(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function getDailyTodos(
  userId: string,
  space: TodoSpace,
  targetDate: string,
): Promise<DailyTodosResult> {
  // 1. Rollover: Carry over any unfinished one-off tasks from past dates to targetDate
  await db
    .update(todos)
    .set({
      dueDate: targetDate,
      isCarriedOver: true,
    })
    .where(
      and(
        eq(todos.userId, userId),
        eq(todos.space, space),
        eq(todos.isRecurring, false),
        eq(todos.isCompleted, false),
        lt(todos.dueDate, targetDate),
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
      streak: r.streak,
      lastCompletedDate: r.lastCompletedDate,
      createdAt: r.createdAt,
    };
  });

  const total = items.length;
  const completed = items.filter((t) => t.isCompleted).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    todos: items,
    stats: {
      total,
      completed,
      percentage,
    },
  };
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

  return {
    ...created,
    space: created.space as TodoSpace,
  };
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
    if (input.isCompleted) {
      const yesterday = getYesterday(input.currentDate);
      let newStreak = 1;
      if (existing.lastCompletedDate === yesterday) {
        newStreak = (existing.streak ?? 0) + 1;
      }
      await db
        .update(todos)
        .set({
          isCompleted: true,
          completedAt: new Date(),
          lastCompletedDate: input.currentDate,
          streak: newStreak,
        })
        .where(eq(todos.id, existing.id));
    } else {
      let newStreak = existing.streak;
      if (existing.lastCompletedDate === input.currentDate) {
        newStreak = Math.max(0, (existing.streak ?? 1) - 1);
      }
      await db
        .update(todos)
        .set({
          isCompleted: false,
          completedAt: null,
          lastCompletedDate: null,
          streak: newStreak,
        })
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

  return true;
}

export async function deleteTodo(userId: string, todoId: string): Promise<boolean> {
  const deleted = await db
    .delete(todos)
    .where(and(eq(todos.id, todoId), eq(todos.userId, userId)))
    .returning({ id: todos.id });

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

