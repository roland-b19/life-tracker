"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./appearance-card";
import { CONTROL, EDGE_PX } from "./edge-swipe";
import { fadeTheme } from "./theme";

/**
 * Listeners every page needs, mounted once in the root layout:
 * - no swipe back or forward (D-035): a touch that starts within `EDGE_PX` of the left or right edge is cancelled,
 *   unless it starts on a control, so a tap on the outer pixels of a tab bar link or a tab still works
 *   (`overscroll-behavior-x: none` in app/globals.css covers the rest). The listener must not be passive, or the
 *   browser ignores `preventDefault`;
 * - the Appearance choice (D-047): a change made in this tab or another tab of this browser applies here, with the fade.
 *   The first render shows Auto (the server cannot see the device's storage) while `<html>` already has what the head
 *   script set, so only a change after that render is applied.
 */
export function ShellListeners() {
  const [theme] = useTheme();
  const shown = useRef(theme);

  useEffect(() => {
    if (theme === shown.current) return;
    shown.current = theme;
    const root = document.documentElement;
    if (theme === (root.dataset.theme ?? "auto")) return;
    fadeTheme();
    if (theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const stopEdgeSwipe = (e: TouchEvent) => {
      const x = e.touches[0]?.clientX;
      if (x === undefined || (x >= EDGE_PX && x <= window.innerWidth - EDGE_PX)) return;
      if (e.target instanceof Element && e.target.closest(CONTROL)) return;
      e.preventDefault();
    };
    document.addEventListener("touchstart", stopEdgeSwipe, { passive: false });
    return () => document.removeEventListener("touchstart", stopEdgeSwipe);
  }, []);
  return null;
}
