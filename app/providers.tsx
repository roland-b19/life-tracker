"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { watchDay } from "./components/day-watch";
import { fadeTheme } from "./components/theme";
import { ToastProvider, useToast } from "./components/toast";

const OFFLINE = "You're offline. Nothing was saved.";
const LOST_REPLY = "Couldn't confirm the change. Reloaded.";
const PAGE_BROKEN = "Couldn't open the page. Try again.";

/** The last page that could not be opened (its path), while the one on screen stays; a new object for each failure. */
type NotOpened = { path: string } | null;
const PageNotOpenedContext = createContext<NotOpened>(null);
/** The last page that could not be opened: the tab bar shows the page on screen again if it was going there. */
export const usePageNotOpened = () => useContext(PageNotOpenedContext);

// The open copies of the app (tabs, windows, the installed app) tell each other about a write on this channel.
const CHANNEL = "life-tracker";
// The refresh after writes waits this long after the last answer, so a burst of writes refreshes once.
const AFTER_WRITES = 600;
// A focus within this long of the last refresh (or of the page load) refreshes nothing: the page is fresh.
const FRESH = 2000;
// An open page on screen refreshes this often.
const EVERY = 60_000;
// A tap on a link waits at most this long for the unanswered writes, the refresh they left due, or the server check of
// a refresh missed offline, so nothing that never answers can keep the app on one page.
const HOLD = 10_000;

// A page payload (React Server Components) is rows like `0:...`, each ending in a newline, after an optional marker
// byte ('#' or '~'). Next does nothing with a navigation answer that is HTTP 200 but not one of these.
const isPagePayload = (text: string) => /^[#~]?[0-9a-f]+:/.test(text) && text.endsWith("\n");

const headersOf = (input: RequestInfo | URL, init?: RequestInit) =>
  new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));

// Each refresh of the page on screen carries its number (`x-refresh`), and the server page can render it back. Next
// sends a write without waiting for a refresh on its way and applies that refresh after the write's own change, so a
// page can tell a server value rendered before a write's answer (its refresh number is at most the one sent by then).
let sent = 0;
/** The number of the last refresh sent: a page rendered for a higher one was rendered after this moment. */
const refreshesSent = () => sent;
// Given to pages by `Providers` (D-044); a function, so the page reads the number when it needs it (at a write's answer).
const RefreshesSentContext = createContext<() => number>(() => 0);
/** The function that gives the number of the last refresh sent. */
export const useRefreshesSent = () => useContext(RefreshesSentContext);

/**
 * Keeps every open copy of the app showing what the server holds. A write here (a server action answered HTTP 2xx)
 * refreshes this page once the writes stop and tells the other copies, which refresh too; every copy also refreshes
 * on focus, when it becomes visible, every minute while visible, and at midnight in Bucharest (day-watch.ts); a refresh
 * that came due while offline runs once the device is back online and the server answers. A write that never got an
 * answer says why: offline nothing was saved (open forms stay as they are); online the answer was lost and the write
 * may have happened, so the page refreshes. A failed answer (non-2xx) changes nothing here.
 * The browser keeps a copy of the pages already seen (`staleTimes` in next.config.ts), and only a refresh drops it. So a
 * tap on a link while a write is unanswered, or before the refresh it (or another copy's write, or a refresh missed
 * offline) left due, waits: the refresh runs at once after the answer, and the tap goes through as soon as the refresh
 * has started, so the page it opens is fetched again and shows the write. Any other tap or key meanwhile forgets it.
 */
function AppShell({ onPageNotOpened }: { onPageNotOpened: (failed: NotOpened) => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  useEffect(() => {
    // Back/forward replays the cached page from before a write, so after any write it reloads once instead.
    let wrote = false;
    let writing = 0;
    let due = false;
    // A refresh that came due while offline, run once the device is back online and the server answers
    let missed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = Date.now();
    // The link a tap waits on (the latest one), and the timer that lets it through after HOLD
    let held: HTMLAnchorElement | null = null;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let passing = false;
    const realFetch = window.fetch;

    // Forgets the tap that waited: its page was not opened, so the tab bar shows the page on screen again.
    const forget = () => {
      const link = held;
      held = null;
      clearTimeout(holdTimer);
      if (link) onPageNotOpened({ path: link.pathname });
    };
    // Taps the link that waited again, now that nothing it could open is older than the last write. A link no longer on
    // the page (the More menu was closed) is forgotten: closing the menu was doing something else.
    const release = () => {
      const link = held;
      if (!link?.isConnected) return forget();
      held = null;
      clearTimeout(holdTimer);
      passing = true;
      try {
        link.click();
      } finally {
        passing = false;
      }
    };

    const refreshNow = () => {
      clearTimeout(timer);
      due = false;
      // Offline, Next would turn the refresh into a full page load, which fails: it waits for the device to be online
      // Without a refresh the tap goes through at once: offline the copy is all there is.
      if (!navigator.onLine) {
        missed = true;
        return release();
      }
      // A tap waits for the refresh the check starts, as after a write's answer
      if (missed) return check();
      last = Date.now();
      day.seen();
      router.refresh();
    };
    // "Online" can come before the server is reachable (a network still settling, a captive portal), and a refresh that
    // fails becomes a full page load that drops an open form: after a missed refresh the server must answer a small
    // request first (`/api/health`, which the service worker never answers). Until it does, the next focus, minute or
    // "online" tries again, and a tap that waits goes through: the copy is all there is.
    const check = () => {
      realFetch("/api/health", { cache: "no-store" }).then(
        (res) => {
          if (!res.ok) return release();
          if (!missed) return;
          missed = false;
          refresh();
        },
        () => release(),
      );
    };
    // A refresh while a write is on its way could show the screen from before it: it waits for the answer.
    const refresh = (delay = 0) => {
      clearTimeout(timer);
      if (writing > 0) due = true;
      else timer = setTimeout(refreshNow, delay);
    };
    const day = watchDay(() => refresh());

    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
    channel?.addEventListener("message", (e) => {
      if (e.data?.type !== "wrote") return;
      due = true;
      refresh(AFTER_WRITES);
    });

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
        if (writing === 0) {
          // A tap that waits for this answer refreshes now instead of after the burst
          if (due && held) refreshNow();
          else if (due) refresh(AFTER_WRITES);
          else release();
        }
      }
    };
    const navigate = async (input: RequestInfo | URL, init: RequestInit | undefined, path: string) => {
      const res = await realFetch(input, init);
      if (res.ok && res.headers.get("content-type")?.startsWith("text/x-component")) {
        res
          .clone()
          .text()
          .then((text) => {
            if (isPagePayload(text)) return;
            showToast({ message: PAGE_BROKEN, type: "warning" });
            onPageNotOpened({ path });
          })
          .catch(() => {});
      }
      return res;
    };
    window.fetch = (input, init) => {
      const headers = headersOf(input, init);
      if (headers.has("next-action")) return write(input, init);
      // A page request for another page (not a prefetch, not a refresh of this one)
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (headers.has("rsc") && !headers.has("next-router-prefetch") && !headers.has("next-router-segment-prefetch")) {
        if (url.pathname !== location.pathname) return navigate(input, init, url.pathname);
        // A refresh of this page: Next dropped its copies of the pages before sending it, so a waiting tap can go.
        if (held) queueMicrotask(release);
        headers.set("x-refresh", String(++sent));
        return realFetch(input, { ...init, headers });
      }
      return realFetch(input, init);
    };

    // A tap on a link of this app while the copies may be older than the last write (see above). A tap with a modifier
    // (new tab or window), on a download or on a link that leaves the app or opens elsewhere goes through. A tap on
    // another link of the app waits in its place.
    const onClick = (e: MouseEvent) => {
      if (passing || !(writing > 0 || due || missed) || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.origin !== location.origin || link.hasAttribute("download")) return;
      if (link.target && link.target !== "_self") return;
      e.preventDefault();
      held = link;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(release, HOLD);
      if (writing === 0) refreshNow();
    };
    window.addEventListener("click", onClick, true);
    // Any other tap or key while a tap waits forgets it: replayed later, it would take the person off what they did since.
    const onInput = (e: Event) => {
      if (held && !(e.target instanceof Node && held.contains(e.target))) forget();
    };
    for (const t of ["pointerdown", "keydown"]) document.addEventListener(t, onInput, true);

    const onFocus = () => {
      if (Date.now() - last >= FRESH) refresh();
      else day.check();
    };
    const onVisible = () => document.visibilityState === "visible" && onFocus();
    const onOnline = () => missed && refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const every = setInterval(() => document.visibilityState === "visible" && refresh(), EVERY);

    const onPop = () => {
      if (wrote) window.location.reload();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      clearTimeout(timer);
      clearTimeout(holdTimer);
      clearInterval(every);
      day.stop();
      channel?.close();
      window.fetch = realFetch;
      window.removeEventListener("click", onClick, true);
      for (const t of ["pointerdown", "keydown"]) document.removeEventListener(t, onInput, true);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("popstate", onPop);
    };
  }, [router, showToast, onPageNotOpened]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [notOpened, setNotOpened] = useState<NotOpened>(null);
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
        <AppShell onPageNotOpened={setNotOpened} />
        <RefreshesSentContext.Provider value={refreshesSent}>
          <PageNotOpenedContext.Provider value={notOpened}>{children}</PageNotOpenedContext.Provider>
        </RefreshesSentContext.Provider>
      </ToastProvider>
    </SessionProvider>
  );
}
