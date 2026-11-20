"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { watchDay } from "./components/day-watch";
import { fadeTheme } from "./components/theme";
import { ToastProvider, useToast } from "./components/toast";

const OFFLINE = "You're offline. Nothing was saved.";
const LOST_REPLY = "Couldn't confirm the change. Reloaded.";
const PAGE_BROKEN = "Couldn't open the page. Try again.";

// The open copies of the app (tabs, windows, the installed app) tell each other about a write on this channel.
const CHANNEL = "life-tracker";
// The refresh after writes waits this long after the last answer, so a burst of writes refreshes once.
const AFTER_WRITES = 600;
// A focus within this long of the last refresh (or of the page load) refreshes nothing: the page is fresh.
const FRESH = 2000;
// An open page on screen refreshes this often.
const EVERY = 60_000;

// A page payload (React Server Components) is rows like `0:...`, each ending in a newline, after an optional marker
// byte ('#' or '~'). Next does nothing with a navigation answer that is HTTP 200 but not one of these.
const isPagePayload = (text: string) => /^[#~]?[0-9a-f]+:/.test(text) && text.endsWith("\n");

const headersOf = (input: RequestInfo | URL, init?: RequestInit) =>
  new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));

/**
 * Keeps every open copy of the app showing what the server holds. A write here (a server action answered HTTP 2xx)
 * refreshes this page once the writes stop and tells the other copies, which refresh too; every copy also refreshes
 * on focus, when it becomes visible, every minute while visible, and at midnight in Bucharest (day-watch.ts). A write
 * that never got an answer says why: offline nothing was saved (open forms stay as they are); online the answer was
 * lost and the write may have happened, so the page refreshes. A failed answer (non-2xx) changes nothing here.
 */
function AppShell() {
  const router = useRouter();
  const { showToast } = useToast();
  useEffect(() => {
    // Back/forward replays the cached page from before a write, so after any write it reloads once instead.
    let wrote = false;
    let writing = 0;
    let due = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = Date.now();

    const refreshNow = () => {
      clearTimeout(timer);
      due = false;
      // Offline, Next would turn the refresh into a full page load, which fails
      if (!navigator.onLine) return;
      last = Date.now();
      day.seen();
      router.refresh();
    };
    // A refresh while a write is on its way could show the screen from before it: it waits for the answer.
    const refresh = (delay = 0) => {
      clearTimeout(timer);
      if (writing > 0) due = true;
      else timer = setTimeout(refreshNow, delay);
    };
    const day = watchDay(() => refresh());

    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
    channel?.addEventListener("message", (e) => e.data?.type === "wrote" && refresh(AFTER_WRITES));

    const realFetch = window.fetch;
    const write = async (input: RequestInfo | URL, init?: RequestInit) => {
      writing++;
      clearTimeout(timer);
      try {
        const res = await realFetch(input, init);
        if (res.ok) {
          wrote = true;
          due = true;
          channel?.postMessage({ type: "wrote" });
        }
        return res;
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          if (!navigator.onLine) {
            showToast({ message: OFFLINE, type: "warning" });
          } else {
            showToast({ message: LOST_REPLY, type: "warning" });
            due = true;
          }
        }
        throw err;
      } finally {
        writing--;
        if (writing === 0 && due) refresh(AFTER_WRITES);
      }
    };
    const navigate = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await realFetch(input, init);
      if (res.ok && res.headers.get("content-type")?.startsWith("text/x-component")) {
        res
          .clone()
          .text()
          .then((text) => !isPagePayload(text) && showToast({ message: PAGE_BROKEN, type: "warning" }))
          .catch(() => {});
      }
      return res;
    };
    window.fetch = (input, init) => {
      const headers = headersOf(input, init);
      if (headers.has("next-action")) return write(input, init);
      // A page request for another page (not a prefetch, not a refresh of this one)
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (headers.has("rsc") && !headers.has("next-router-prefetch") && !headers.has("next-router-segment-prefetch") && url.pathname !== location.pathname) {
        return navigate(input, init);
      }
      return realFetch(input, init);
    };

    const onFocus = () => {
      if (Date.now() - last >= FRESH) refresh();
      else day.check();
    };
    const onVisible = () => document.visibilityState === "visible" && onFocus();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const every = setInterval(() => document.visibilityState === "visible" && refresh(), EVERY);

    const onPop = () => {
      if (wrote) window.location.reload();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      clearTimeout(timer);
      clearInterval(every);
      day.stop();
      channel?.close();
      window.fetch = realFetch;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("popstate", onPop);
    };
  }, [router, showToast]);
  return null;
}

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
    // A system switch between dark and light fades too (it shows only in Auto; with a forced mode nothing changes).
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", fadeTheme);
    return () => {
      scheme.removeEventListener("change", fadeTheme);
      sw?.removeEventListener("message", onSw);
      for (const t of ["pointerdown", "keydown"]) document.removeEventListener(t, touch, { capture: true });
      document.removeEventListener("gesturestart", blockPinch);
    };
  }, []);

  // A double-tap or double-click in a field selects everything in it. The browser's own double-tap selects one word and
  // stops at spaces, commas and other punctuation, so a value like "1,5 kg" could never be selected whole.
  // Only the element is compared, not the position: a form that moves up when the keyboard opens shifts the field
  // between the two taps. iOS sets its word selection a little after the second tap, so for a moment every selection
  // change in that field is turned back into a full selection.
  useEffect(() => {
    let tap: { el: EventTarget | null; t: number } = { el: null, t: 0 };
    let hold: { el: HTMLInputElement | HTMLTextAreaElement; until: number } | null = null;
    const selectAll = (el: HTMLInputElement | HTMLTextAreaElement) => {
      if (el.selectionStart === 0 && el.selectionEnd === el.value.length) return;
      el.select();
      try {
        el.setSelectionRange(0, el.value.length);
      } catch {}
    };
    const onUp = (e: PointerEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || ["checkbox", "radio", "range", "button", "submit"].includes((el as HTMLInputElement).type)) return;
      const again = tap.el === el && e.timeStamp - tap.t < 500;
      tap = again ? { el: null, t: 0 } : { el, t: e.timeStamp };
      if (!again) return;
      hold = { el, until: Date.now() + 800 };
      for (const delay of [0, 60, 150, 300, 500]) setTimeout(() => selectAll(el), delay);
    };
    const onSelection = () => {
      if (hold && Date.now() < hold.until && document.activeElement === hold.el) selectAll(hold.el);
    };
    document.addEventListener("pointerup", onUp);
    document.addEventListener("selectionchange", onSelection);
    return () => {
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("selectionchange", onSelection);
    };
  }, []);

  return (
    <SessionProvider>
      <ToastProvider>
        <AppShell />
        {children}
      </ToastProvider>
    </SessionProvider>
  );
}
