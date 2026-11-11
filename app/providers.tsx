"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "./components/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // In dev, chunk URLs are not content-hashed, so the worker must not cache them (stale-module errors).
      navigator.serviceWorker
        .register(process.env.NODE_ENV === "development" ? "/sw.js?dev" : "/sw.js")
        .catch(() => {});
    }
    // iOS Safari ignores user-scalable=no, so block the pinch gesture directly.
    const blockPinch = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", blockPinch);

    // A scale shrinks wide things more pixels than narrow ones and CSS cannot read an element's width,
    // so every pressable element gets its own --press (4px a side) before it moves.
    const LIFTS = ".surface, .split-day-card, .macro-card, .routine-row, .side-user, .nav-link, .tab-item, .month-nav-btn, button, input, select, textarea";
    const size = (e: Event) => {
      let el = e.target instanceof Element ? e.target.closest<HTMLElement>(LIFTS) : null;
      for (; el; el = el.parentElement?.closest<HTMLElement>(LIFTS) ?? null) {
        const w = el.offsetWidth;
        if (!w) continue;
        el.style.setProperty("--press", String(Math.max(0.92, 1 - 8 / w)));
      }
    };
    document.addEventListener("pointerover", size);
    document.addEventListener("focusin", size);

    // Most writes no longer re-render the page (the client keeps its own state), but back/forward replays the cached,
    // pre-write page. After any server action ran, a back/forward therefore reloads once instead of showing old data.
    let wrote = false;
    const realFetch = window.fetch;
    window.fetch = (input, init) => {
      if (new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).has("next-action")) wrote = true;
      return realFetch(input, init);
    };
    const onPop = () => {
      if (wrote) window.location.reload();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.fetch = realFetch;
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("gesturestart", blockPinch);
      document.removeEventListener("pointerover", size);
      document.removeEventListener("focusin", size);
    };
  }, []);

  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
