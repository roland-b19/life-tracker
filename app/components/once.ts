"use client";

import { useRef } from "react";

/**
 * The one guard for a button that writes (D-043): one write at a time per target, and one per tap burst.
 * `once(target, write, spot)` runs `write` unless an earlier write for the same `target` (a row's key, or the form) has
 * not settled yet, and answers whether it ran; a write for another target goes through, and Next sends it after the
 * one in flight. `spot` is the tapped button: the rest of a double tap on its place is swallowed (see swallowBurst), so
 * it neither repeats the write nor lands on what slid into the button's place (the next row's Delete, or the button
 * under a form that closed). A tap on the toast always goes through.
 */
export function useOnce() {
  const writing = useRef(new Set<string>());
  return (target: string, write: () => unknown, spot: Element | null | undefined) => {
    if (writing.current.has(target)) return false;
    writing.current.add(target);
    if (spot) swallowBurst(spot.getBoundingClientRect());
    const done = () => writing.current.delete(target);
    try {
      Promise.resolve(write()).then(done, done);
    } catch (error) {
      done();
      throw error;
    }
    return true;
  };
}

/** How long the clicks after a write's first tap count as the same double tap (about the system's double-click time). */
const BURST_MS = 500;

/**
 * Swallows the clicks that land in `spot` (the tapped button's place) within `BURST_MS`: by then what is under the
 * finger may be the next row's Delete, or the button beneath a form that closed. The click being handled is already
 * past. A burst is only taps on that one spot, so a click elsewhere, or typing, ends it and goes through. A click in the
 * toast area always goes through and ends it too: on a phone the toast can open over the button's place, and its Undo
 * must take the very next tap.
 */
function swallowBurst(spot: DOMRect) {
  const end = () => {
    clearTimeout(timer);
    window.removeEventListener("click", stop, true);
    window.removeEventListener("keydown", end, true);
    window.removeEventListener("input", end, true);
  };
  const stop = (e: MouseEvent) => {
    const onToast = e.target instanceof Element && e.target.closest(".toast-container") !== null;
    const inSpot = e.clientX >= spot.left && e.clientX <= spot.right && e.clientY >= spot.top && e.clientY <= spot.bottom;
    if (onToast || !inSpot) return end();
    e.preventDefault();
    e.stopPropagation();
  };
  const timer = setTimeout(end, BURST_MS);
  window.addEventListener("click", stop, true);
  window.addEventListener("keydown", end, true);
  window.addEventListener("input", end, true);
}
