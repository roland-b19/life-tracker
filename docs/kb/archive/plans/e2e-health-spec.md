---
summary: Plan for the Health e2e spec: Playwright on /health (Today flows, Shopping list, axe), run locally and in CI with the existing e2e job.
last_verified: 2026-11-18
---

# Plan: e2e-health-spec

## Goal
Only the weight card of the Health page (`/health`, the home page) has a browser spec. The rest of the page, which the owner uses every day, has none. This adds one for the owner and every later change to the page: logging a meal, the nutrition goals, water and steps, and the Shopping list, each with its Undo, checked against the database.

## Scope
- In: `tests/e2e/health.spec.ts` with five tests (four flows on `desktop`, one axe test on both projects); the KB updates. No new dependency: Playwright and axe are already installed (D-005).
- Out: the weight card (`tests/e2e/weight.spec.ts`); the two Categories cards of the Shopping tab (categories and units; another session writes their spec); the Assistant tab (it renders only with `NEXT_PUBLIC_CLAUDE_ENABLED=true`, which a local `.env` may set and CI does not, and its action runs the `claude` CLI; the spec neither opens it nor asserts it is absent); a day stepper and "read-only past day" (the page has no day stepper: it shows and writes today only, and the rule `metricDayEditable` is covered by Vitest); any app code, `playwright.config.ts` or `ci.yml` change; `tests/e2e/helpers.ts` (nothing in it needs to change); fixing an accessibility finding by excluding it from the scan. A real bug the spec finds is reported in the pull request, not fixed here.

## Done criteria
- [x] `npm run e2e` passes on both projects with the 5 new tests added to the existing ones (4 new on `desktop`, the axe one on `desktop` and `phone`) — checked by running it against a private test database (`CI=1`, `DATABASE_URL` and `DATABASE_URL_MIGRATE` set to it) and reading the passed count.
- [x] The meal flow, on the Today tab, logs a meal through the "New meal" form (calories 450, protein 30, carbs 40, fat 12) and sees the row `Meal · 450 kcal · P 30 · C 40 · F 12`, the toast `Added meal (450 kcal)` and `/ 3350 kcal` (the default goal) in the Nutrition card; Undo empties the list ("No meals logged today."); it logs again, deletes the meal (toast `Removed "Meal"`) and Undo brings the same row back; each state is also seen after a reload — checked by the spec's assertions.
- [x] The goals flow edits the four nutrition goals in "Edit goals", sees them in the Nutrition card and the toast `Saved nutrition goals`, then Undo restores the old goals, each also after a reload — checked by the spec's assertions.
- [x] The water and steps flow taps `+250 ml` (toast `Added 250 ml`, `250 / 3000 ml`; Undo returns to 0), sets the water total and goal in "Edit water" (toast `Water set to …, goal …`; Undo restores both), and sets the steps total and goal in "Edit steps" (toast, Undo), each also after a reload — checked by the spec's assertions.
- [x] The Shopping flow, on the Shopping tab, adds an item (toast `Added "<name>"`), edits it (name, amount), ticks it (toast `Bought "<name>"`, Undo), clears the bought items (toast `Cleared 1 bought item`, Undo brings it back), and deletes it (toast `Removed "<name>"`, Undo brings it back), each also after a reload and each Undo checked in the database — checked by the spec's assertions.
- [x] axe finds no serious or critical violation on the Today tab, with the "New meal" form open, on the Shopping tab with an item listed and with the "New shopping item" form open, on `desktop` and `phone` — checked by the spec (a finding is fixed in the code, never excluded).
- [x] The specs make no waits by time and find elements by role, label or text only — checked by `grep -rn "waitForTimeout\|locator(" tests/e2e` finding nothing.
- [ ] `npm run check` passes with a private database, and CI on the pull request is green — checked by the command and the pull request's checks. The pull request is not merged.

## Decisions
- D-014: Health e2e spec: the Today and Shopping tabs in four flows, checked in the database; no day stepper, no Assistant tab
- D-005: End-to-end specs with Playwright Test on `next dev`, Chromium desktop and phone (already active; this plan follows it)
- D-012: Tasks e2e spec (the model: `andSettle` with a body piece, reload checks, `@a11y` tag)

## Steps
1. [x] Today flows — files: `tests/e2e/health.spec.ts` (create); tests: itself, run with `npm run e2e -- health.spec.ts`.
   - Shared: `openHealth(page, tab: "Today" | "Shopping")` goes to `/health`, expects the URL, clicks the tab (`getByRole("tab", { name, exact: true })`; on 375 px `Shopping` shows its short label `Shop`, so the `@a11y` test finds that tab with the name `/^Shop(ping)?$/`) and waits for a button that only that tab has (`Add meal` or `Add item`). A reload goes through the same helper, because the page reopens on Today.
   - Meal flow: as in the done criterion. The Nutrition card is `getByRole("region", { name: "Nutrition" })`; numbers animate, so read them with the auto-retrying `expect(...).toContainText`. Dismiss a toast with "Dismiss notification" before a step that makes the next Undo, so only one Undo button exists, as the Tasks spec does.
   - Goals flow: "Edit goals" opens the dialog "Edit goals"; fill `Calories (kcal)`, `Protein (g)`, `Carbs (g)`, `Fat (g)` with values different from the defaults; Save through `andSettle`; expect `/ <n> kcal` in the card; Undo through `andSettle`; reload and expect the same.
   - Water and steps flow: `+250 ml` (a tap sends one action; `andSettle`); "Edit water and goal" opens "Edit water" with `Water today (ml)` and `Daily goal (ml)`; "Edit steps and goal" opens "Edit steps" with `Steps today` and `Daily goal (steps)`. Check the Water and Steps regions (`getByRole("region", { name: "Water" })`, `"Steps"`).
   - If a name is not found as written (a toast, a label or a region name differs), read the real text in `app/health/food-client.tsx` and use it; never loosen to a CSS selector.
2. [x] Shopping flow and axe — files: `tests/e2e/health.spec.ts` (change); tests: itself.
   - Shopping flow: "Add item" opens "New shopping item" with `Name`, `Amount`, `Unit` (select) and the category field; fill name `E2E item <8 hex>` and amount 2, Save through `andSettle`; the row shows `<name> · 2 pcs`; edit with `Edit <name>` (dialog "Edit shopping item"), change the name and amount; tick with `Mark <name> as bought` (Undo, then tick again); "Clear bought" (Undo brings the row back, then clear again and Undo); delete with `Delete <name>` and Undo. The Shopping list card is `getByRole("region", { name: "Shopping list" })`. A tick, a delete and a clear are optimistic: `andSettle` waits for the action's POST, and a reload proves the database. The Undo of a tick or a clear sends a second action, so pass `andSettle` a body piece that tells it from the first (the item id or `"isBought":false`; read the real body in `src/actions/food.ts` and the browser).
   - Axe test (`@a11y`, both projects): Today tab, scan; "Add meal", wait for the dialog "New meal", scan, close it with `Cancel`; Shopping tab, add an item, scan; "Add item", wait for the dialog "New shopping item", scan.
3. [x] KB and docs — files: `docs/kb/conventions.md`, `docs/kb/architecture.md`, `docs/kb/status.md`, `docs/kb/log/2026-11.md`, `docs/kb/INDEX.md`, `docs/kb/decisions/general.md` (change: the plan link after archiving); tests: `python3 .claude/skills/maintain-kb/scripts/kb_check.py docs/kb`.
4. [ ] Verify and hand off — files: none; tests: `npm run check` and `npm run e2e` against a private database, then the merge-branch skill opens the pull request and CI is green. Do not merge it.

## Cleanup and docs
- Nothing becomes unused: no app code, helper or config changes.
- `docs/kb/conventions.md`, End-to-end specs: list `tests/e2e/health.spec.ts` (the Today flows, the Shopping list and the axe scans of both tabs; D-014); update the run count (5 more tests; other sessions add specs at the same time, so recount after merging `origin/main`).
- `docs/kb/architecture.md`, Tests: mention the Health spec next to the weight one.
- `docs/kb/status.md`: Roadmap line "Health e2e spec (`/health`, D-014)" with the plan link while in progress, then done; archive the plan when done (`git mv` to `docs/kb/archive/plans/`, and fix the decision's link).
- `docs/kb/log/2026-11.md`: an entry for the plan and, at the end, one for the build; `docs/kb/INDEX.md`: the current-state line mentions the Health spec.
- `docs/kb/domain.md`: the line "Water and steps can be edited only for today and yesterday … Past days are read-only" stays true for the server; no change unless a builder finds the UI differs from it.
- Risk tier: only `tests/**` and `docs/**` change, so Low.

## Approval
Status: done 2026-11-18
