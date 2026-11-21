"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * View controls remembered per device (D-041): tabs, sorts, folds. Each key holds JSON in `localStorage`; every read
 * and write is in try/catch, so blocked or corrupt storage only means the control starts from its fallback. Values are
 * read once per key and shared by every component that uses the key; other tabs of the browser follow through the
 * `storage` event.
 */
const NOTHING = Symbol("nothing stored");
const values = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

function read(key: string): unknown {
  if (!values.has(key)) {
    let value: unknown = NOTHING;
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) value = JSON.parse(raw);
    } catch {}
    values.set(key, value);
  }
  return values.get(key);
}

const notify = (key: string) => listeners.get(key)?.forEach((l) => l());

// Another tab changed a key (or cleared storage, `key` null): read it again on next use.
function onStorage(e: StorageEvent) {
  for (const key of e.key === null ? [...values.keys()] : values.has(e.key) ? [e.key] : []) {
    values.delete(key);
    notify(key);
  }
}

function subscribe(key: string, listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** A stored value counts only when it has the fallback's shape (an array for an array, a string for a string). */
const fits = (stored: unknown, fallback: unknown) =>
  stored !== NOTHING &&
  (fallback === null || fallback === undefined || (Array.isArray(fallback) ? Array.isArray(stored) : typeof stored === typeof fallback && stored !== null && !Array.isArray(stored)));

/**
 * A view control kept on this device: `[value, set]` like `useState`. The server and the first browser render show
 * `fallback` (the server cannot see the device's storage, so the two renders match), then the stored value takes over.
 * Pass a `fallback` that keeps its identity across renders (a constant), since it is returned as the value.
 */
export function useDeviceState<T>(key: string, fallback: T) {
  const stored = useSyncExternalStore(
    useCallback((listener: () => void) => subscribe(key, listener), [key]),
    () => read(key),
    () => NOTHING,
  );
  const value = fits(stored, fallback) ? (stored as T) : fallback;
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const now = read(key);
      const prev = fits(now, fallback) ? (now as T) : fallback;
      const update = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
      values.set(key, update);
      try {
        localStorage.setItem(key, JSON.stringify(update));
      } catch {} // storage blocked or full: the value lasts until the page reloads
      notify(key);
    },
    [key, fallback],
  );
  return [value, set] as const;
}
