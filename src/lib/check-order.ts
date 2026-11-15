interface Checkable {
  done: boolean;
  /** When the box last changed (ticked or unticked); null if it never did. */
  at: Date | string | null;
}

export const time = (d: Date | string | null) => (d ? +new Date(d) : 0);

/**
 * The order every checklist shares (Tasks, Shopping): unchecked rows first, then checked ones. A row just ticked
 * goes to the top of the checked rows; a row just unticked goes to the bottom of the unchecked ones. Unchecked rows
 * nobody touched keep the list's own order (0 here, so the caller's next comparison decides).
 */
export function compareChecked(a: Checkable, b: Checkable): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.done) return time(b.at) - time(a.at);
  return +!!a.at - +!!b.at || time(a.at) - time(b.at);
}

/** Shopping rows within one category: the shared check order, then by name. Sorting by category stays with the caller. */
export const compareShopping = (
  a: { isBought: boolean; checkedAt: Date | string | null; name: string },
  b: typeof a,
) => compareChecked({ done: a.isBought, at: a.checkedAt }, { done: b.isBought, at: b.checkedAt }) || a.name.localeCompare(b.name);
