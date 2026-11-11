import { and, eq, gte } from "drizzle-orm";
import { db } from "@/server/db";
import { todoCompletions, todos } from "@/db/schema";

type Tx = Pick<typeof db, "insert" | "update" | "delete" | "select">;
type Todo = typeof todos.$inferSelect;

/** Ends a repeating task on `day`: it leaves that day and the days ahead (their ticks go too), the days before keep it. */
export async function endTodo(tx: Tx, userId: string, todoId: string, day: string): Promise<void> {
  await tx.update(todos).set({ endedOn: day }).where(and(eq(todos.id, todoId), eq(todos.userId, userId)));
  await tx.delete(todoCompletions).where(and(eq(todoCompletions.todoId, todoId), gte(todoCompletions.date, day)));
}

/**
 * Changes a repeating task from `day` on without touching the days before: the old task ends on `day` and a copy
 * with the changes starts there (same order in the list, same ticked days, so the streak carries on). Returns the copy.
 * shortcut: the two halves are not linked, so deleting the old one does not delete a later copy; add a column if that matters.
 */
export async function splitTodo(
  tx: Tx,
  task: Todo,
  day: string,
  changes: Partial<Pick<Todo, "title" | "reminderTime" | "category">>,
): Promise<Todo> {
  const { id, ...copy } = task;
  const [next] = await tx.insert(todos).values({ ...copy, ...changes, dueDate: day }).returning();
  const ticked = await tx.select().from(todoCompletions).where(eq(todoCompletions.todoId, id));
  if (ticked.length) await tx.insert(todoCompletions).values(ticked.map((t) => ({ todoId: next.id, date: t.date })));
  await endTodo(tx, task.userId, id, day);
  return next;
}
