"use client";

import { ViewTransition } from "react";

// The new page's rows wait (globals.css) only until the page is mostly faded in, then build while it settles.
const ROWS_AFTER = 80;
function onEnter() {
  const root = document.documentElement;
  const timer = setTimeout(() => root.classList.add("rows-go"), ROWS_AFTER);
  return () => {
    clearTimeout(timer);
    root.classList.remove("rows-go");
  };
}

/** Templates remount on every navigation, so the old page exits and the new one enters. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none" onEnter={onEnter}>
      {children}
    </ViewTransition>
  );
}
