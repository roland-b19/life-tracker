# Status

_Last updated: 2026-11-16 by Claude (GymClient split, undoWith helper)._

The history that used to fill this file (every phase, the verification table, the long session log) is in `docs/STATUS-archive.md`. Decisions: `docs/decisions.md`.

## Where we are

- `main` holds everything through the four forms-audit PRs (#112 to #115). The Tier 1 to 3 iterations, the Wishlist-style UI for every page and the Azure reminder pipeline (PRs #101 to #103) are merged.
- The personal deploy (variant B, Vercel + Neon) is live and holds the user's real data; its runbook is in `README.md`. Nothing is deployed to Azure (see below).
- Browser check of PR #116 (375px and desktop): Meals add/delete/Undo, today's weigh-in delete/Undo and the Shopping tab work. Not checked: a past day (read-only), older weigh-ins.
- PR #116 (delete meals and weigh-ins, migration 0030) is merged. Open: #104 (`fix/azure-migrate`, untouched) and the Gym audit branch (below).

## Current focus

Branch `refactor/gym-split` (PR open; merge on the user's word). The Gym audit PR (#117) is merged; migrations 0030 and 0031 are files the user runs from their Mac.
- `app/gym/gym-client.tsx` (1346 lines) is now a 93-line composition. The pieces: `use-workout.ts` (the workout in hand), `active-workout.tsx`, `exercise-logger.tsx`, `training-days.tsx`, `day-editor.tsx`, `deload-card.tsx`, `history-card.tsx`, `types.ts`. No behaviour change.
- New helper `undoWith(showToast, write, failed)` in `app/components/toast.tsx`: an Undo that writes the old state back and warns when the write fails. Used by the day editor and the deload dialog.
- Checked in a browser (375px and desktop): day edit and Undo, start, log set, delete set and Undo, Exit and Resume, Finish, history open, deload edit and Undo, modal focus returns to its button. Not checked: Cancel workout and its Undo, a custom exercise created inside the day editor, a real phone, the Three.js model.

## Application features (local)

- **Implemented locally:**
  - Pinned non-root container (`Dockerfile` with Node 24 LTS, `nextjs` user 1001).
  - Health endpoint (`/health`) and security headers.
  - OIDC authentication with production guard (`AUTH_DEV=false`).
  - Drizzle ORM schema, owner-scoped queries and restricted PostgreSQL roles.
  - Gym module: 5-day Upper/Lower split, set logging (`reps x load`), anomaly flags `!!`, PR tracking, 5-week deload tracker.
  - Food & Nutrition module: daily targets, meal logger, Past foods sheet, water tap counter (+250ml, +500ml), steps, shopping list filled by hand (categories editable and deletable), Today tab steps back through past days read-only.
  - Money module: removed from the UI on 2026-11-06; its tables were dropped by migration `0019` (3b).
  - To-Do & Habits module: automatic carry-over rollover, streak tracking, space segregation (`personal` vs `business`), Web Push notifications.
  - Food AI Connector (Claude MCP & Gemini): removed on 2026-11-08 (endpoints, tools, token code and tests); the `api_tokens` table was dropped by migration `0019` (3b). The in-app Assistant only logs meals.

## Next

1. The user runs migration 0030, then 0031 (duplicate checks first) from their Mac.
2. Optional: use `undoWith` on the other pages (about 25 hand-written Undos); only on the user's word.
3. The Categories card is cramped at about 800px; PR #104 (`fix/azure-migrate`) is still open and untouched.
4. Azure A (`docs/release-plan.md` section 5) after a week of watching variant B. Nothing deploys and no Azure resource is created without the user's explicit OK.

## Open questions

See "Open" in `docs/decisions.md`.

## Deployed Azure resources

None for Life Tracker. All resources deployed for Iteration 2 testing were
synchronously deleted via `scripts/azure-teardown.sh stage DELETE`. The subscription's
pre-existing `NetworkWatcherRG` is not owned by this project and was intentionally left untouched.

Checked on 2026-11-08: the only resource group in the subscription is `NetworkWatcherRG` (Network Watchers in belgiumcentral, polandcentral and italynorth, no flow logs, no cost). The empty `lt-identity` group from the External ID attempt was deleted the same day. Six soft-deleted Key Vaults from earlier deploys cost nothing and are purged by Azure on 2027-02-01.

## Session log (newest first)

- 2026-11-16 — Gym audit fixes (`fix/gym-audit`, migration 0031 is a file): see Current focus. Tests: 249 pass (gym.test.ts has the new constraint, unit-mixing, custom exercise authorization/restore and race tests).

- 2026-11-16 — Forms audit, PR 4 of 4 (`fix/forms-audit-4`, stacked on PR 3, not merged, no migration): dead code deleted (about 390 CSS lines, the unused date picker, day stepper, DateField/DayField, StatRow, SkeletonRows, Hint, ReadonlyNote, BarChart, the unused `getDailyTodosAction` endpoint and four unused helpers/schemas; its test now calls the library function); the design skill and AGENTS.md no longer describe parts that do not exist and list all three animation exceptions; the sign-in error uses the shared `ErrorText`; the category save error names the noun. Tests: 235 pass. Not checked in a browser (CSS was pruned by script; braces balance, tsc and eslint clean). Left for later: shopping category guards, the repeated optimistic/Undo pattern, the 890/1190-line Food and Gym clients, the stale parts of this file.
- 2026-11-15 — Forms audit, PR 3 of 4 (`fix/forms-audit-3`, stacked on PR 2, not merged, no migration): every modal form has one synchronous submit lock in `FormModal` (the hand-written locks in Tasks and Wishlist are gone), so a double tap saves once; the steps limit is one number, 200000, for the log and the goal; a weigh-in cannot be dated in the future (the form and the API); the weight card re-reads today's date when it opens and recovers when its row was deleted or created elsewhere (PATCH 404 creates it, POST 409 updates the existing one); the water edit's Undo puts back the difference, so taps made in between are kept; the Gym day form needs sets, min and max reps before Save; decimals show with a comma in the weight card and the Gym loads. Tests: 235 pass. Not checked in a browser or on a phone.
- 2026-11-15 — Forms audit, PR 2 of 4 (`fix/forms-audit-2`, stacked on PR 1, not merged, no migration): water never goes over 20000 ml a day (server clamps, a tap sends only what fits so Undo is exact; at the limit a warning says so); "Clear bought" clears only the bought items on screen (ids go to the server); toggle, delete, restore and clear of an item that is not on the user's list now fail instead of reporting success; editing a shopping item onto another one with the same name and unit is refused inline (not merged silently); an empty unit is refused and units are lower-cased; delete Undo shows the row at once; a whole-number field drops everything after a dot or comma ("250.5" is 250, not 2505). Tests: 234 pass. Not checked in a browser.
- 2026-11-15 — Forms audit, PR 1 of 4 (`fix/forms-audit-1`, not merged, no migration): the forms say what is wrong instead of "Failed to ...". Food meal, water/steps total and shopping item check the server limits on screen (calories 10000, macros 1000 g, total 20000 ml or 200000 steps, name 120, amount 0.01-1000, a 0 amount is refused); Gym day and custom exercise check sets 1-10, reps 1-100, name 2+; Wishlist no longer shows the server message (production hides it). Names made only of zero-width characters are refused by every name schema (`visible`). Next in the plan: PR 2 shopping and water, PR 3 weight/dates/submit lock, PR 4 dead code and docs. Not checked in a browser.
