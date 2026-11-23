/**
 * The fields of `to` whose value differs from the one in `from`, a missing value counting as null: an edit sends only
 * these, so another device's change to the rest stays (D-040). A field emptied is sent as null.
 */
export function changedFields<T extends object>(from: Partial<Record<keyof T, unknown>>, to: T): Partial<T> {
  return Object.fromEntries(
    (Object.keys(to) as (keyof T)[]).filter((k) => (to[k] ?? null) !== (from[k] ?? null)).map((k) => [k, to[k] ?? null]),
  ) as Partial<T>;
}
