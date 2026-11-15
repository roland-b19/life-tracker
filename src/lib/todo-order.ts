import { compareChecked, time } from "./check-order";

interface Orderable {
  id: string;
  isCompleted: boolean;
  completedAt: Date | string | null;
  placedAt: Date | string;
  createdAt: Date | string;
}

/**
 * Where tasks re-filed into a category land: on top of it as one tight block (1 ms apart, so nothing else can fall
 * between them), in the order they had. Shared by the server and the optimistic UI.
 */
export function blockPlacements(rows: { id: string; placedAt: Date | string }[], now = Date.now()): Map<string, Date> {
  const oldest = [...rows].sort((a, b) => time(a.placedAt) - time(b.placedAt) || a.id.localeCompare(b.id));
  return new Map(oldest.map((r, i) => [r.id, new Date(now - (oldest.length - 1 - i))]));
}

/**
 * List order shared by the server and the optimistic UI: the checklist order (see compareChecked), and among the
 * tasks nobody ticked or unticked on that day, the newest placed on top (created, moved, carried over or put back).
 * `completedAt` is when the box last changed on that day. Nothing else decides, so a row only moves when it is acted on.
 */
export function compareTodos(a: Orderable, b: Orderable): number {
  return (
    compareChecked({ done: a.isCompleted, at: a.completedAt }, { done: b.isCompleted, at: b.completedAt }) ||
    time(b.placedAt) - time(a.placedAt) ||
    time(b.createdAt) - time(a.createdAt) ||
    a.id.localeCompare(b.id)
  );
}
