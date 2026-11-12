import { and, eq, gte } from "drizzle-orm";
import { db } from "@/server/db";
import { addDays } from "./format-date";
import { todoCompletions, todoDayMarks, todos } from "@/db/schema";

type Tx = Pick<typeof db, "insert" | "update" | "delete" | "select">;
type Todo = typeof todos.$inferSelect;

/** Ends a repeating task on `day`: it leaves that day and the days ahead (their ticks go too), the days before keep it. */
export async function endTodo(tx: Tx, userId: string, todoId: string, day: string): Promise<void> {
  await tx.update(todos).set({ endedOn: day }).where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
  await tx.delete(todoCompletions).where(and(eq(todoCompletions.todoId, todoId), gte(todoCompletions.date, day)));
  // The order marks stay: they are never read for a day the task has left, and Undo then finds them again.
}

/** Gives a copy of a repeating task the ticked days and the per-day order marks of the original. */
async function copyDays(tx: Tx, fromId: string, toId: string): Promise<void> {
  const ticked = await tx.select().from(todoCompletions).where(eq(todoCompletions.todoId, fromId));
  if (ticked.length) await tx.insert(todoCompletions).values(ticked.map((t) => ({ todoId: toId, date: t.date })));
  const marks = await tx.select().from(todoDayMarks).where(eq(todoDayMarks.todoId, fromId));
  if (marks.length) await tx.insert(todoDayMarks).values(marks.map((m) => ({ todoId: toId, date: m.date, at: m.at })));
}

/**
 * Changes a repeating task from `day` on without touching the days before: the old task ends on `day` and a copy
 * with the changes starts there (same place in the list, same ticked days and order marks, so the streak carries on). Returns the copy.
 * shortcut: the two halves are not linked, so deleting the old one does not delete a later copy; add a column if that matters.
 */
export async function splitTodo(
  tx: Tx,
  task: Todo,
  day: string,
  changes: Partial<Pick<Todo, "title" | "reminderTime" | "category" | "placedAt">>,
): Promise<Todo> {
  const { id, ...copy } = task;
  const [next] = await tx.insert(todos).values({ ...copy, ...changes, dueDate: day }).returning();
  await copyDays(tx, id, next.id);
  await endTodo(tx, task.userId, id, day);
  return next;
}

/** What an Undo needs to join a past day back into its task: the copy that took over from the next day, the end date the task had, and the day. */
export interface Rejoin {
  laterId?: string;
  endedOn: string | null;
  day: string;
}

/**
 * Changes one past day of a repeating task and nothing after it: the task ends on `day`, a copy (all ticks, so streaks
 * carry on) takes over from the next day, and with `changes` a one-day task holds `day` itself. Returns that one-day
 * task and what Undo needs. A task that starts on `day` has nothing before it, so it is deleted instead of ended.
 */
export async function isolateDay(
  tx: Tx,
  task: Todo,
  day: string,
  changes?: Partial<Pick<Todo, "title" | "reminderTime" | "category">>,
): Promise<{ middle?: Todo; join: Rejoin }> {
  const { id, ...copy } = task;
  const next = addDays(day, 1);
  const born = async (values: typeof copy) => {
    const [row] = await tx.insert(todos).values(values).returning();
    await copyDays(tx, id, row.id);
    return row;
  };
  const later = !task.endedOn || task.endedOn > next ? await born({ ...copy, dueDate: next }) : undefined;
  const middle = changes ? await born({ ...copy, ...changes, dueDate: day, endedOn: next }) : undefined;
  if (task.dueDate < day) await endTodo(tx, task.userId, id, day);
  else await tx.delete(todos).where(and(eq(todos.id, id), eq(todos.userId, task.userId)));
  return { middle, join: { laterId: later?.id, endedOn: task.endedOn, day } };
}
