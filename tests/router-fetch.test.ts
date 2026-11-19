import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withRouterTimeout } from "@/../app/components/router-fetch";

// A request that never answers on its own, as iOS can leave one (D-027); it only ends when its signal aborts.
const stranded = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
  return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
});
const answered = vi.fn(async () => new Response("ok"));

describe("the router's page requests give up instead of holding up the app", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("a navigation or refresh with no answer is aborted after the time limit", async () => {
    const result = withRouterTimeout(stranded, 10_000)("/gym?_rsc=1", { headers: { rsc: "1" } });
    const settled = vi.fn();
    result.catch(settled);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });

  it("an answered request is left alone, and the caller's own signal still aborts it", async () => {
    await expect(withRouterTimeout(answered, 10_000)("/gym?_rsc=1", { headers: { rsc: "1" } })).resolves.toBeInstanceOf(Response);
    const own = new AbortController();
    const result = withRouterTimeout(stranded, 10_000)("/gym?_rsc=1", { headers: { rsc: "1" }, signal: own.signal });
    own.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });

  it("prefetches, server actions and other requests pass through untouched", async () => {
    const guarded = withRouterTimeout(answered, 10_000);
    const inits: RequestInit[] = [
      { headers: { rsc: "1", "next-router-prefetch": "1" } },
      { method: "POST", headers: { "next-action": "abc" } },
      { headers: { accept: "application/json" } },
    ];
    for (const init of inits) await guarded("/x", init);
    expect(answered.mock.calls.map((call) => (call as unknown[])[1])).toEqual(inits);
  });
});
