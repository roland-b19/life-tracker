# Stress-test report (2026-11-12)

Branch `feat/health-undo-polish` (PR #87). Local dev database only; nothing ran against Neon, nothing deployed, no migration added.

## Method

- Dev-only seed `scripts/seed-stress.cjs` (refuses non-local databases and `AUTH_DEV` off): 400 wishlist items over 40 categories (every price edge, 120-char, emoji, RTL, quotes and HTML-looking names), 300 shopping items over 12 sections (one 50-char), 3 years of meals (leap day, 0 and 10 000 kcal), a year of weight, 200 days of water and steps, 300 tasks (both spaces, 30 categories each, repeating with and without end days, 120 days of completions). Users: `stress` (full), `empty` (nothing), plus the existing `catseed`.
- Vitest edge-case tests against the real test database (194 tests, was 186).
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
| 10 | The Health Assistant could write meals into any past or future date (the manual form only allows today and yesterday) | `sendFoodChatMessageAction` never checked the day | same `metricDayEditable` rule in `src/app/actions/food-chat.ts` | `tests/food-chat.test.ts` |
| 11 | Enabling reminders twice (or a double tap) stored two rows for one endpoint, so every reminder was sent twice | `push_subscriptions` has no unique key on `endpoint` | delete-then-insert in one transaction in `savePushSubscription`; key fields trimmed and capped | `tests/todos.test.ts` |
| 12 | Gym set form capped Reps at 100 while the server accepts 200 (a 150-rep set could not be typed) | stale `max` | `max="200"` in `app/gym/gym-client.tsx` (routine editor stays 100, as on the server) | browser (150-rep set saved) |

After the fixes every page (`/`, Wishlist, Tasks, Health tabs, Gym tabs, Settings) reports `scrollWidth` equal to the viewport at 320, 375 and 768, for both the stress user and the empty user.

## Checked and fine

Browser pass 1 (phone 375x812, 320, 768, desktop):

- Wishlist, Tasks (add with HTML and emoji, delete plus exact Undo), Health (Today, Water, Weight chart ranges, Steps, Shop, AI), Gym (start, log sets with extreme values, finish with Undo, Progress), Settings and the More menu at phone width.
- Zero states of every page for the `empty` user: sensible text, no overflow.
- The "elements under 44pt" list is a false positive: small controls reach 44pt through an invisible `::before` hit area.

Browser pass 2 (gap closing, local `empty` and `stress` users, Undo checked as "same row back" by comparing `id` and `created_at` in the database before and after):

- Wishlist: add, edit, delete + Undo, categories add/rename/delete + Undo.
- Tasks: Personal and Business, Today and Daily, move, edit-split, category rename/delete + Undo.
- Gym: Cancel workout, History, routine editor, custom exercise (name stored trimmed and added to the routine), 150-rep set.
- Health Today: nutrition goals edit (out-of-range values blocked by the form) and its Undo, Add meal (blank name rejected, HTML-looking name shown as text), meal delete + Undo (same row), Past foods log and delete + Undo.
- Shop: add items, mark bought, Clear bought + Undo (same ids, still bought), category add/rename/delete + Undo.
- Water and Steps: Today/Yesterday day selector writes the right day, edit, delete + Undo (same row for Water).
- Weight: 19 kg and 3 decimals blocked, add, delete + Undo.
- Assistant: a real message ("I ate two eggs") logged a meal for today, flagged estimated.
- Sign-out through a real pointer click on a server whose `NEXTAUTH_URL` matches: `POST /api/auth/signout` 200, redirected to `/signin`.
- Design review against the Wishlist at 375 and desktop: same card, title row, button, chip and toast styles on Tasks, Health (all tabs), Gym and Settings. The app is dark-only by design (`color-scheme: dark`), so there is no light mode to review.

Audit of `src/lib/categories.ts`, food-chat, gym-progress, weight-stats, streak, push subscriptions and `src/server/same-origin.ts`: two real findings (bugs 10 and 11); the rest is correct and already has owner / other user / anonymous tests.

## Not fixed, decide later

- A browser session cookie for a user row that no longer exists makes `/food` return 500 (`nutrition_targets` foreign key). Only reachable after a database reset; the JWT session deliberately does no database lookup. Real users are never deleted. Not changed.
- Undo of a hard-deleted task restores the id and the millisecond `created_at`, but not the microsecond part (JavaScript `Date` has millisecond precision).
- Undo of a deleted weigh-in re-creates the row with a new id and `created_at` (same date and kilograms). It is the documented decision of 2026-11-05 and nothing references the id; an exact restore would need a new API route.
- The seed's 20 kg and 500 kg weight outliers did not insert (date conflicts); those limits are covered by unit tests only.
- Minor: if a select is forced to a value that is not in its options (only possible by script), the Edit item dialog shows a raw validation message.

## Not verified

- Real iPhone Safari (only emulated viewports in the in-app browser).
- Sign-out on the primary dev server on port 3000: I did not touch it (another session uses it). The same code path was proven on a second server.
- Shopping "import": there is no import control in the UI; only the server action is tested.
- Not run against the live Neon database, by rule. Migration `0023_meals_forgotten` is still pending there; Past foods delete depends on it.
