"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "./components/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
    // Tabs open from the browser's cache (`staleTimes`), so a write also refreshes that cache in the background once the
    // writes stop: the page on screen keeps its own state, the other tabs come back fresh.
    let wrote = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const realFetch = window.fetch;
    window.fetch = (input, init) => {
      if (new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).has("next-action")) {
        wrote = true;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => router.refresh(), 600);
      }
      return realFetch(input, init);
    };
    const onPop = () => {
      if (wrote) window.location.reload();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      clearTimeout(refreshTimer);
      window.fetch = realFetch;
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("gesturestart", blockPinch);
      document.removeEventListener("pointerover", size);
      document.removeEventListener("focusin", size);
    };
  }, [router]);

  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
