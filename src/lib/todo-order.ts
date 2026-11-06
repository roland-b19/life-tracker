interface Orderable {
  isCompleted: boolean;
  isCarriedOver: boolean;
  completedAt: Date | string | null;
  createdAt: Date | string;
}

const time = (d: Date | string | null) => (d ? +new Date(d) : 0);

/**
 * List order shared by the server and the optimistic UI: open tasks first (carried over first,
 * then oldest first), then done tasks, the most recently done on top.
 */
export function compareTodos(a: Orderable, b: Orderable): number {
  if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
  if (a.isCompleted) return time(b.completedAt) - time(a.completedAt);
  return +b.isCarriedOver - +a.isCarriedOver || time(a.createdAt) - time(b.createdAt);
}
