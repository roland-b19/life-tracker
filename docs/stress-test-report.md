# Stress-test report (2026-11-12)

Branch `feat/health-undo-polish` (PR #87). Local dev database only; nothing ran against Neon, nothing deployed, no migration added.

## Method

- Dev-only seed `scripts/seed-stress.cjs` (refuses non-local databases and `AUTH_DEV` off): 400 wishlist items over 40 categories (every price edge, 120-char, emoji, RTL, quotes and HTML-looking names), 300 shopping items over 12 sections (one 50-char), 3 years of meals (leap day, 0 and 10 000 kcal), a year of weight, 200 days of water and steps, 300 tasks (both spaces, 30 categories each, repeating with and without end days, 120 days of completions). Users: `stress` (full), `empty` (nothing), plus the existing `catseed`.
- Vitest edge-case tests against the real test database (192 tests, was 186).
- Browser walkthrough at 320x640, 375x812, 768x1024 and desktop, reading console and network.

## Bugs found and fixed

| # | Bug | Cause | Fix | Test |
|---|-----|-------|-----|------|
| 1 | A task titled with only spaces was stored | `.trim()` ran after `.min(1)` | `.trim()` first in `src/lib/validations/todos.ts` | `tests/todos.test.ts` |
| 2 | Wishlist name of only spaces accepted; prices with more than two decimals stored unrounded; priority boundary drift | same ordering, no rounding | `.trim()` first, price rounded to cents, max 10 000 000 | `tests/wishlist.test.ts` |
| 3 | Meals, Water and Steps could be written on any past date through the actions | only the UI limited it | `assertWritableDay` (today or yesterday) in `src/app/actions/food.ts` | `tests/food.test.ts` |
| 4 | Food and gym names of only spaces accepted | `.trim()` ordering | `.trim()` first in `food.ts` and `gym.ts` validations | `tests/food.test.ts` |
| 5 | A repeating task could start outside the 7-day planning window (create or move) | window check skipped for recurring tasks | `assertPlannable` also checks recurring tasks; Undo paths pass `startedBefore` | `tests/todos.test.ts` |
| 6 | A 120-char meal name with no spaces widened the whole Health page and tab bar (1334px at 375) | flex child without `min-width: 0` | `.entry-row > div { min-width: 0; overflow-wrap: anywhere }` | visual (CSS) |
| 7 | Shopping tab overflowed (1007px at 375): long item names and the 50-char section name | same | `.shopping-item-name`, `.group-toggle` rules | visual (CSS) |
| 8 | Water, Steps and Weight rows overflowed 5-15px at 320px | no wrapping on `.weight-main` | `flex-wrap: wrap` | visual (CSS) |
| 9 | Gym training-day cards overflowed 6px at 320px | grid item with default `min-width: auto` | `.split-day-card { min-width: 0 }` | visual (CSS) |

After the fixes every page (`/`, Wishlist, Tasks, Health tabs, Gym tabs, Settings) reports `scrollWidth` equal to the viewport at 320, 375 and 768, for both the stress user and the empty user.

## Checked and fine

- Wishlist, Tasks (add with HTML and emoji, delete plus exact Undo), Health (Today, Water, Weight chart ranges, Steps, Shop, AI), Gym (start, log sets with extreme values, finish with Undo, Progress), Settings and the More menu at phone width.
- Zero states of every page for the `empty` user: sensible text, no overflow.
- The "elements under 44pt" list is a false positive: small controls reach 44pt through an invisible `::before` hit area.

## Not fixed, decide later

- A browser session cookie for a user row that no longer exists makes `/food` return 500 (`nutrition_targets` foreign key). Only reachable after a database reset; real users are never deleted. Not changed.
- UI reps input has `max=100`, the server accepts 200. Harmless.
- Undo of a hard-deleted task restores the id but not the microsecond part of `created_at`.
- The seed's 20 kg and 500 kg weight outliers did not insert (date conflicts); those limits are covered by unit tests only.

## Not verified

- Real iPhone Safari (only emulated viewports in the in-app browser).
- Sign-out through a real pointer click on the second dev server: the form posted to `localhost:3100` (the other dev server's auth URL), which the CSP `form-action 'self'` blocked. That is a port mismatch of my local setup, not an app bug, but I did not prove it by repeating the click on the primary server.
- Not exercised in the UI: Gym Cancel workout and History, routine editor and custom exercise, Wishlist add/edit/delete, Tasks Business/Today/move/edit-split, nutrition targets edit, Past foods delete with Undo, Shopping add/import/clear with Undo, Assistant chat, Weight add/delete, Steps day selector. Their server actions are covered by the existing and new Vitest tests.
- Not audited this pass: `src/lib/categories.ts`, food-chat, gym-progress, weight-stats, streak, push subscriptions, `src/server/same-origin.ts`.
