"use client";

import { useEffect } from "react";
import { followThemeFromOtherTabs } from "./appearance-card";
import { CONTROL, EDGE_PX } from "./edge-swipe";

/**
 * Listeners every page needs, mounted once in the root layout:
 * - no swipe back or forward (D-035): a touch that starts within `EDGE_PX` of the left or right edge is cancelled,
 *   unless it starts on a control, so a tap on the outer pixels of a tab bar link or a tab still works
 *   (`overscroll-behavior-x: none` in app/globals.css covers the rest). The listener must not be passive, or the
 *   browser ignores `preventDefault`;
 * - a theme chosen in another tab of this browser applies here too (MORE-06).
 */
export function ShellListeners() {
  useEffect(() => {
    const stopEdgeSwipe = (e: TouchEvent) => {
      const x = e.touches[0]?.clientX;
      if (x === undefined || (x >= EDGE_PX && x <= window.innerWidth - EDGE_PX)) return;
      if (e.target instanceof Element && e.target.closest(CONTROL)) return;
      e.preventDefault();
    };
    document.addEventListener("touchstart", stopEdgeSwipe, { passive: false });
    window.addEventListener("storage", followThemeFromOtherTabs);
    return () => {
      document.removeEventListener("touchstart", stopEdgeSwipe);
      window.removeEventListener("storage", followThemeFromOtherTabs);
    };
  }, []);
  return null;
}
