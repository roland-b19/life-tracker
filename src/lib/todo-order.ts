import { compareChecked } from "./check-order";

interface Orderable {
  isCompleted: boolean;
  isCarriedOver: boolean;
  completedAt: Date | string | null;
  createdAt: Date | string;
}

const time = (d: Date | string | null) => (d ? +new Date(d) : 0);

/**
 * List order shared by the server and the optimistic UI: the checklist order (see compareChecked), and among the
 * tasks nobody unticked, carried over first, then newest first, so a new task lands on top.
 * `completedAt` is when the box last changed.
 */
export function compareTodos(a: Orderable, b: Orderable): number {
  return (
    compareChecked({ done: a.isCompleted, at: a.completedAt }, { done: b.isCompleted, at: b.completedAt }) ||
    +b.isCarriedOver - +a.isCarriedOver ||
    time(b.createdAt) - time(a.createdAt)
  );
}
