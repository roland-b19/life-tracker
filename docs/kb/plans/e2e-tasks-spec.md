---
summary: Plan for the Tasks e2e spec: Playwright on /todos (Today flow with Undo, space and tab split, axe), run locally and in CI with the existing e2e job.
last_verified: 2026-11-18
---

# Plan: e2e-tasks-spec

## Goal
Only the Wishlist and the weight card have a browser spec; Tasks (`/todos`), a page the owner uses every day, has none. This adds one for the owner and every later change to that page: the add, complete, edit and delete flows with their Undo toasts, and the split between the two spaces and the two lists, checked against the database.

## Scope
- In: `tests/e2e/tasks.spec.ts` with three tests; moving `andSettle` from `tests/e2e/weight.spec.ts` into `tests/e2e/helpers.ts` so both specs use one copy; the KB updates. No new dependency: Playwright and axe are already installed (D-005).
- Out: the categories card and everything about categories (its own spec later); the reminder field and the "Task reminders" card (`NEXT_PUBLIC_PUSH_ENABLED` is off in e2e, so they do not render); carried-over tasks (they depend on yesterday's data); Gym and the other pages; any app code, auth code, Playwright config or `ci.yml` change (CI already runs `npm run e2e`); fixing an accessibility finding by excluding it from the scan.

## Done criteria
- [ ] `npm run e2e` passes on both projects with 12 tests (8 existing plus 4 new: the flow and the split run on `desktop`, the axe test on `desktop` and `phone`) — checked by running it against a private test database and reading `12 passed`.
- [ ] The flow test, on the Today tab of the Personal space, adds a task and sees its row and "0 of 1 done" in the Progress card; completes it (the box, "1 of 1 done", the "Completed" toast), Undo brings back "0 of 1 done"; completes it again and reloads (still done); edits the title and Undo restores the old one; deletes it and Undo brings it back; each write is followed by a reload that shows the same state — checked by the spec's assertions.
- [ ] The split test adds a daily task on the Daily tab of Personal, and sees it there but not on the Today tab ("Nothing planned for today.") and not on Daily of Business ("No daily tasks yet."), also after a reload — checked by the spec's assertions.
- [ ] axe finds no serious or critical violation on `/todos` with a task listed and with the "New task" form open, on `desktop` and `phone` — checked by the spec (a finding is fixed in the code, never excluded).
- [ ] The specs make no waits by time and find elements by role, label or text only — checked by `grep -rn "waitForTimeout\|locator(" tests/e2e` finding nothing.
- [ ] `weight.spec.ts` still passes after `andSettle` moves, and no copy of `andSettle` is left in a spec file — checked by `npm run e2e` and `grep -rn "function andSettle" tests/e2e` finding only `helpers.ts`.
- [ ] `npm run check` passes with a private database (`CI=1`, `DATABASE_URL` and `DATABASE_URL_MIGRATE` set to it), and CI on the pull request is green.

## Decisions
- D-012: Tasks e2e spec: the Today flow plus the space and tab split, checked in the database, one shared settle helper
- D-005: End-to-end specs with Playwright Test on `next dev`, Chromium desktop and phone (already active; this plan follows it)

## Steps
1. [ ] Share `andSettle` — files: `tests/e2e/helpers.ts` (change: export `andSettle(page, act)`, the function from `weight.spec.ts` with the page as a parameter), `tests/e2e/weight.spec.ts` (change: import it, delete the local copy and its comment); tests: `npm run e2e -- weight.spec.ts` still passes on both projects.
2. [ ] The Tasks spec — files: `tests/e2e/tasks.spec.ts` (create); tests: itself, run with `npm run e2e -- tasks.spec.ts`.
   - Shared: `openTasks(page, tab)` goes to `/todos`, expects the URL, and clicks the `Today` or `Daily` tab (`getByRole("tab", { name })`; the page opens on Daily), then waits for the "Add task" button. A unique title `E2E task <8 hex>` per test.
   - Flow test (desktop only, no tag): on Today, "Add task" opens the dialog "New task"; fill `Title` (`getByLabel("Title")`), Save through `andSettle`; expect the row (`getByText(title, { exact: true })`), the toast `Added "<title>"` and `0 of 1 done` in the "Progress" region. Dismiss the toast with "Dismiss notification" before each step that makes a new Undo, so only one Undo button exists. Complete with the button `Mark <title> as complete` through `andSettle`; expect `1 of 1 done` and the toast `Completed "<title>"`; Undo through `andSettle` gives `0 of 1 done`; complete again and `reload`, expect the button `Mark <title> as incomplete`. Edit with `Edit <title>`, change the title, Save: toast `Saved "<new>"`; Undo restores the old title, also after a reload. Delete with `Delete <title>`: row gone, toast `Removed "<title>"`, Undo through `andSettle` puts it back, also after a reload.
   - Split test (desktop only): on Daily, add a daily task (dialog "New daily task"; the category stays at its default), expect it in the list; the Today tab shows "Nothing planned for today."; the Business space (`getByRole("tab", { name: "Business" })`) on Daily shows "No daily tasks yet."; back on Personal, the task is still there; after a reload the same holds.
   - Axe test (`@a11y`, both projects): open Today, add a task so a row exists, scan, open "Add task", wait for the dialog "New task", scan.
   - If a name is not found as written (a toast or label differs), read the real text in `app/todos/todos-client.tsx` and use it; never loosen to a CSS selector.
3. [ ] KB and docs — files: `docs/kb/conventions.md`, `docs/kb/architecture.md`, `docs/kb/status.md`, `docs/kb/log/2026-11.md`, `docs/kb/INDEX.md` (change); tests: `python3 .claude/skills/maintain-kb/scripts/kb_check.py docs/kb`.
4. [ ] Verify and hand off — files: none; tests: `npm run check` and `npm run e2e` against a private database, then the merge-branch skill opens the pull request and CI is green. Do not merge it.

## Cleanup and docs
- Nothing becomes unused: `andSettle` in `weight.spec.ts` is replaced by the helper in step 1, in the same change.
- `docs/kb/conventions.md`, End-to-end specs: three specs; list `tests/e2e/tasks.spec.ts`; `andSettle` now lives in `helpers.ts`; the run count is 12 (8 on `desktop`, 4 on `phone`, the `@a11y` ones on both).
- `docs/kb/architecture.md`, Tests section: mention the Tasks spec next to the other two, if it lists specs.
- `docs/kb/status.md`: Roadmap line "Tasks e2e spec (D-012)" with the plan link while in progress, then done; archive the plan when done (`git mv` to `docs/kb/archive/plans/`).
- `docs/kb/log/2026-11.md`: an entry for the plan and, at the end, for the build; `docs/kb/INDEX.md`: the current-state line mentions the Tasks spec.
- Risk tier: only `tests/**` and `docs/**` change, so Low.

## Approval
Status: approved 2026-11-18
