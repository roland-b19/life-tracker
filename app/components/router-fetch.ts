/**
 * Gives up a page request of the router (an RSC GET: a navigation or a refresh, not a prefetch or a server action) that
 * has no answer after `ms`. iOS can strand a request that a Home Screen app sent while a system sheet or a file viewer
 * covered it, or while it was in the background, and the router then keeps every later navigation and action waiting
 * behind it (D-027). Aborted by a signal of its own (not Next's), the request fails and Next loads that page the
 * normal way, so the app comes back instead of staying stuck.
 */
export function withRouterTimeout(fetch: typeof globalThis.fetch, ms: number): typeof globalThis.fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has("rsc") || headers.has("next-router-prefetch") || headers.has("next-action")) return fetch(input, init);
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, stop.signal]) : stop.signal;
    return fetch(input, { ...init, signal }).finally(() => clearTimeout(timer));
  };
}
