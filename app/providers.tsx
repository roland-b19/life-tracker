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
    // Portrait only: this works in an installed or fullscreen app; a browser tab is kept upright by the CSS in globals.css.
    try {
      void (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.("portrait")?.catch(() => {});
    } catch {}

    // Which way the phone is turned, for the CSS that keeps the page upright against the device (globals.css).
    const turn = () => {
      const angle = screen.orientation?.angle ?? (window as { orientation?: number }).orientation ?? 0;
      document.documentElement.dataset.rot = angle === 270 || angle === -90 ? "cw" : "ccw";
    };
    turn();
    window.addEventListener("orientationchange", turn);
    window.addEventListener("resize", turn);

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
    return () => {
      window.removeEventListener("orientationchange", turn);
      window.removeEventListener("resize", turn);
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
