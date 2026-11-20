"use client";

import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useToast } from "./toast";

export const ITEM_DELETED = "This item was deleted.";

/** The ids of the rows in `before` that `after` no longer has. Values that are not lists of rows have none. */
export function rowsGone(before: unknown, after: unknown): string[] {
  if (!Array.isArray(before) || !Array.isArray(after)) return [];
  const ids = (rows: unknown[]) => rows.flatMap((r) => (r && typeof r === "object" && "id" in r ? [String(r.id)] : []));
  const kept = new Set(ids(after));
  return ids(before).filter((id) => !kept.has(id));
}

/**
 * A page's copy of what the server sent: the screen changes it at once (optimistic), and a new server value (a
 * refresh after a write here, in another tab or on focus) replaces it. `editing`: the id of the row an open edit form
 * is on; when a new server value no longer has that row (deleted elsewhere), `onDeleted` closes the form and a toast
 * says "This item was deleted.".
 */
export function useServerState<T>(
  serverValue: T,
  watch: { editing?: string | null; onDeleted?: () => void } = {},
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(serverValue);
  const [seen, setSeen] = useState(serverValue);
  const [gone, setGone] = useState<{ ids: string[] }>({ ids: [] });
  if (seen !== serverValue) {
    setSeen(serverValue);
    setState(serverValue);
    setGone({ ids: rowsGone(seen, serverValue) });
  }

  const { showToast } = useToast();
  const handled = useRef(gone);
  const { editing, onDeleted } = watch;
  useEffect(() => {
    if (handled.current === gone) return;
    handled.current = gone;
    if (!editing || !gone.ids.includes(editing)) return;
    onDeleted?.();
    showToast({ message: ITEM_DELETED, type: "warning" });
  }, [gone, editing, onDeleted, showToast]);

  return [state, setState];
}
