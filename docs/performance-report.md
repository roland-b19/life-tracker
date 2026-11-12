# Performance report: "instant feel" (branch `perf/instant-feel`)

Date: 2026-11-12. Scope: find every place time is lost, record what is already fast, fix what is worth fixing. Hard limits kept: no Neon or Vercel settings touched, no ping or cron, no new dependency, no migration, nothing run against the live database, nothing deployed.

## How it was measured

- A real production build (`next build`, standalone output) served locally, with the session cookie injected by a small proxy (the production cookie is `__Host-` and `Secure`).
- Database: a local Postgres with TLS (Docker) holding the stress seed (`seed-stress`: 408 wishlist items, 41 daily tasks, months of meals, workouts and weights).
- A query counter wraps `pg`'s `Client.query` in the **scratch build only** (never committed). It adds a simulated per-query latency (8 ms is about a warm Neon round trip from Frankfurt; 0 ms shows the pure compute cost).
- `DB_POOL_MAX=1` (what `.env.example` recommends for Vercel; the real value on Vercel is not visible from here) and `DB_POOL_MAX=5`. With one connection, queries run one after another, so **the number of round trips is the cost**. With five, independent queries overlap.
- Same method for "before" (a clean `origin/main` build) and "after" (this branch), one request after a warm-up, median of 7.
- Browser checks at 375x812 in the built-in browser against the production build, with 150 ms per query to make waiting visible.

## Findings and changes

### 1. `revalidatePath` after almost every write (largest loss)

In Next 16 a server action that calls `revalidatePath` makes the response carry a **full re-render of the page**, so a tap on "+250 ml" ran the whole food page again (7 queries, 102 KB of RSC payload) just to return one number the client already had.

| Write | Before | After |
| --- | --- | --- |
| `addWaterAction` (pool 1, 8 ms) | 112-135 ms, 8 queries, 102,668 B | 15-18 ms, 1 query, 284 B |
| steps, meals, shopping, metrics (food) | same page re-render each time | no re-render, 1-2 queries |
| `logSetAction`, `deleteSetAction` (gym) | page re-render per set | no re-render |

Wishlist and Todos writes, `logSet` and `deleteSet` already had no revalidation (already optimized). Gym **start, cancel, restore, finish, reopen, split-day and custom-exercise** writes keep `revalidatePath("/gym")`, because the open-workout view is driven by page props; a test pins which actions revalidate (`tests/query-count.test.ts`).

### 2. Back/forward after a write showed the old page

Without the re-render, the browser's back/forward replays the cached RSC payload from before the write, and client state remounts from the stale props. Fix in `app/providers.tsx`: once any server action has run in this tab, a `popstate` (back/forward) reloads the page once. Link navigation is unaffected (dynamic pages have `staleTimes` 0, so every link tap fetches fresh data). Checked in the browser.

### 3. No loading state: a tap on a tab showed nothing until the server finished

Added `loading.tsx` (a shared `PageSkeleton`) for food, gym, todos, wishlist and settings. Link prefetch loads it, so the skeleton shows on the tap itself (26-145 ms in the browser at 150 ms per query, while the full page took 0.5-1.8 s). An async `layout.tsx` above each one (`app/components/require-session.tsx`) keeps the **real 307 redirect for anonymous visitors**: without it, `loading.tsx` would have turned `/gym` for a signed-out visitor into a 200 with a meta refresh. Verified with curl.

### 4. Sequential database round trips

- Gym page: `getUserSplitWithDays` and `getExercises` ran their seed check first and then read; now they read first and only seed when something is missing. `getWorkoutHistory`, `getGymHistory` and the others run together in one `Promise.all`. `ensureDefaultExercises` shares one in-flight promise so two parallel callers seed once (test added). Gym page: 13 queries to 11, 167 to 127 ms (pool 1) and 78 to 41 ms (pool 5).
- `logWorkoutSet`: the session check and the exercise check run together.
- `getDailyFoodSummary`: meals and the day's metrics run together (2 queries, 1 round trip with pool 5).
- `getDailyTodos`: tasks and completions run together (the completions query uses a sub-select instead of waiting for the task ids). Pool 5: 48 to 45 ms. **Honest caveat:** with pool 1 the completions query now also runs for a space with no recurring tasks, so the stress user's `/todos` went from 10 to 11 queries (122 to 134 ms at 8 ms per query). A user with recurring tasks in both spaces has the same query count as before.

### 5. Client bundle

`zod` was reaching the browser through three client components that imported a constant from a validation file. Those constants moved to `src/lib/rules.ts` (no zod); the validation files re-export them so server code is untouched.

| Page | First-load JS before (raw / gzip) | After |
| --- | --- | --- |
| food | 783 / 238 KB | 674 / 207 KB |
| todos | 764 / 233 KB | 656 / 202 KB |
| wishlist | 751 / 229 KB | 643 / 198 KB |
| gym, settings, signin | 669 / 633 / 628 KB | unchanged |

(Both columns use the same method: the script URLs in the rendered HTML, summed from `.next/static`.)

### 6. Pool settings (`src/server/db.ts`): no change

`max` and the idle timeout are already read from `DB_POOL_MAX` and `DB_IDLE_TIMEOUT_MS`, so they can be tuned without code. A longer idle timeout would keep connections warm between taps, but on a function that is frozen between requests a longer-lived idle socket is the one that comes back dead, and a Neon connection test is outside what can be done here. Left as is; the knobs and trade-off are recorded in `docs/decisions.md`.

## Page timings (median, local)

| Page | Before, pool 1 / 8 ms | After | Before, pool 5 / 8 ms | After | After, pool 1 / 0 ms |
| --- | --- | --- | --- | --- | --- |
| food | 111 ms, 7 q | 103 ms, 7 q | 41 ms | 40 ms | 23 ms |
| gym | 167 ms, 13 q | 127 ms, 11 q | 78 ms | 41 ms | 11 ms |
| todos | 122 ms, 10 q | 134 ms, 11 q | 48 ms | 45 ms | 17 ms |
| wishlist | 44 ms, 2 q | 43 ms, 2 q | 34 ms | 31 ms | 23 ms |
| settings | 19 ms, 1 q (first baseline run) | 14 ms, 1 q | n/a | 14 ms | 4 ms |

The page renders were already fast; the felt gain is in writes (no page re-render) and in the instant skeleton. `getDaySummaryAction` stays at about 28 ms and 2 queries under pool 1 (it only overlaps with pool > 1). `addShoppingItemAction`: 2 queries, about 30 ms.

## Already optimized (verified, left alone)

- The JWT session callback does no database lookup.
- Histories are windowed (workouts 370 days, charts by range); props byte and query budgets are enforced in tests (`tests/query-count.test.ts`).
- Page loaders already use `Promise.all`.
- The muscle map loads `three` lazily and only on its tab; `/models` is `immutable` for a year.
- The service worker caches only `/_next/static` (content-hashed), cache-first; never HTML or actions.
- Wishlist, todos and gym set edits are already optimistic with exact Undo; failed calls roll back and toast (verified: failing `fetch` for a server action reverts "+500 ml" and shows "Failed to add water").
- The weight API is `no-store`.
- Indexes: `(user_id, date)` style indexes exist on the hot tables; no query was slow at stress scale, so **no migration is needed and none is proposed**.

## Left as is, on purpose

- `staleTimes` stays 0: any positive value would show stale data after a write.
- Wishlist HTML is 681 KB for 408 items (gzip is far smaller; a real list is much shorter). Virtualizing it would change behaviour and animation; not worth it.
- The `/todos` page runs two carry-over `UPDATE`s on every visit (one per space); that is correctness logic, not a cost worth changing here.
- Gym start/cancel/restore are still slow-ish by design: they re-render the page because the page props drive the workout view.

## Not measured

- Neon cold start and real Neon/Vercel latency, the real `DB_POOL_MAX` on Vercel, and real phone network conditions.
- In the built-in browser the service worker registration logs "unknown error fetching the script"; `/sw.js` itself returns 200 with the right type, and the worker code is untouched, so this is taken as a quirk of the embedded browser.
- The local `tsc` run can report a conflict between `.next/types` and `.next/dev/types` after a dev server and a build have both run; it is a local artifact (clean with `.next/dev` excluded) and not in CI.
