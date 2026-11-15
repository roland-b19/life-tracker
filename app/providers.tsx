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
    // The service worker opens the app from the last seen page (public/sw.js) and tells us when the server's page differs.
    // Reload for it, but only if nothing was touched yet and not twice in a row (a page that never settles would loop).
    let touched = false;
    const touch = () => (touched = true);
    const onSw = (e: MessageEvent) => {
      if (e.data?.type !== "stale" || touched) return;
      try {
        const last = Number(sessionStorage.getItem("sw-reload") ?? 0);
        if (Date.now() - last < 30_000) return;
        sessionStorage.setItem("sw-reload", String(Date.now()));
      } catch {}
      window.location.reload();
    };
    const sw = navigator.serviceWorker;
    for (const t of ["pointerdown", "keydown"]) document.addEventListener(t, touch, { once: true, capture: true });
    sw?.addEventListener("message", onSw);
    sw?.controller?.postMessage({ type: "stale-check", url: window.location.href });
    const onPop = () => {
      if (wrote) window.location.reload();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      clearTimeout(refreshTimer);
      window.fetch = realFetch;
      window.removeEventListener("popstate", onPop);
      sw?.removeEventListener("message", onSw);
      for (const t of ["pointerdown", "keydown"]) document.removeEventListener(t, touch, { capture: true });
      document.removeEventListener("gesturestart", blockPinch);
    };
  }, [router]);

  // A double-tap or double-click in a field selects everything in it. The browser's own double-tap selects one word and
  // stops at spaces, commas and other punctuation, so a value like "1,5 kg" could never be selected whole.
  useEffect(() => {
    let tap: { el: EventTarget | null; t: number; x: number; y: number } = { el: null, t: 0, x: 0, y: 0 };
    const onUp = (e: PointerEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || ["checkbox", "radio", "range"].includes((el as HTMLInputElement).type)) return;
      const again = tap.el === el && e.timeStamp - tap.t < 400 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 24;
      tap = again ? { el: null, t: 0, x: 0, y: 0 } : { el, t: e.timeStamp, x: e.clientX, y: e.clientY };
      if (!again) return;
      // The browser sets its own word selection after the second tap; select again right after it.
      for (const delay of [0, 80]) setTimeout(() => { el.select(); try { el.setSelectionRange(0, el.value.length); } catch {} }, delay);
    };
    document.addEventListener("pointerup", onUp);
    return () => document.removeEventListener("pointerup", onUp);
  }, []);

  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
