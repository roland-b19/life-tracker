---
summary: Plan for the Gym e2e spec: Playwright on /gym (workout flow with Undo, cancel, routine setup, custom exercise, axe), run locally and in CI with the existing e2e job.
last_verified: 2026-11-18
---

# Plan: e2e-gym-spec

## Goal
The Gym page (`/gym`) is the largest page of the app and the owner trains with it, yet it has no browser spec: only Wishlist, the weight card and Tasks do. This adds one for the owner and every later change to that page: set up a training day, start a workout, log a set, finish or cancel it, read the history and manage custom exercises, each change with its Undo, checked against the database after a reload.

## Scope
- In: `tests/e2e/gym.spec.ts` with five tests (four flows on `desktop`, one `@a11y` test on `desktop` and `phone`); the KB updates. No new dependency (Playwright and axe exist, D-005); no new helper in `tests/e2e/helpers.ts` (`andSettle` and `expectNoSeriousViolations` are enough, so the sessions that add other specs at the same time do not collide with this one).
- Out: the 3D muscle map and its chips (WebGL may be missing in CI; the page is still scanned by axe with the map in whatever state it reaches, and nothing is excluded from the scan); the deload card and deload weeks; the Exercise progress chart; renaming a custom exercise; deleting a single logged set (Undo of a logged set is covered instead); drag-to-reorder in the day editor; the workout timer's value; any app code, auth code, Playwright config or `ci.yml` change; fixing an accessibility finding by excluding it from the scan. A real bug found by the spec is reported in the pull request, not fixed here.

## Done criteria
- [x] `npm run e2e` passes with the five new tests added to the existing ones (6 new runs: 5 on `desktop`, the `@a11y` one again on `phone`) — checked by running it against a private test database and reading `passed` with no failure.
- [x] The routine test edits the "Upper (chest)" day: creates a new exercise from the editor ("New exercise" then "Create and add"), saves the day, sees the exercise in the day's preview and still sees it after a reload; Undo of the save brings the old routine back, also after a reload — checked by the spec's assertions.
- [x] The workout test starts "Upper (chest)" (and Undo of the start returns to the list while no set is logged), logs a set of "Incline barbell press" (Undo removes it, logging again adds it), finishes the workout (it shows in History and the reload keeps it), Undo of the finish reopens it (the reload shows the Resume banner and no finished workout) — checked by the spec's assertions.
- [x] The cancel test logs a set, answers "Keep" to the cancel question, then cancels and deletes; History stays empty after a reload; Undo of the cancel brings the workout back with its set, also after a reload — checked by the spec's assertions.
- [x] The custom exercise test creates an exercise in the day editor and closes the dialog without saving the day; "My exercises" lists it, also after a reload; Delete removes it, also after a reload; Undo brings it back, also after a reload — checked by the spec's assertions.
- [x] axe finds no serious or critical violation on `/gym`, with the "Edit" day dialog open and with a workout started, on `desktop` and `phone` — checked by the spec (a finding is fixed in the code, never excluded; it is then also a real bug for the pull request).
- [x] The spec makes no waits by time and finds elements by role, label or text only, never picks a day by the weekday (the seeded split has rest days that change with the date) — checked by `grep -n "waitForTimeout\|locator(" tests/e2e/gym.spec.ts` finding nothing, and `grep -n "Today\|weekday" tests/e2e/gym.spec.ts` finding no day picked by the date.
- [x] `npm run check` passes with a private database (`CI=1`, `DATABASE_URL` and `DATABASE_URL_MIGRATE` set to it), and CI on the pull request is green.

## Decisions
- D-014: Gym e2e spec: the workout, cancel, routine and custom-exercise flows checked in the database, days picked by name, no 3D map flow
- D-012: Tasks e2e spec (the model this plan follows: Undo checked after a reload, `andSettle` with a body piece)
- D-005: End-to-end specs with Playwright Test on `next dev`, Chromium desktop and phone (already active; this plan follows it)

## Steps
1. [x] Shared pieces and the axe test — files: `tests/e2e/gym.spec.ts` (create); tests: itself, `npm run e2e -- gym.spec.ts`.
   - `openGym(page)`: `goto("/gym")`, expect the URL, expect the region "Training days" visible (a new user gets the default split seeded by the page itself).
   - `startDay(page, name)`: in the "Training days" region click `Start <name>` through `andSettle` (no body piece: starting sends one action), then expect the region named after the day's workout (`getByRole("region", { name: name })` is the active workout card, titled with the day's name).
   - Days are always picked by name, never by "Today": the seeded split is `Upper (chest)` (Sunday), `Legs (hamstrings)`, `Rest`, `Upper (back)`, ..., and the day the page selects at load depends on the date. To make a day the picked one, click its button in "Training days" (`getByRole("button", { name: /Upper \(chest\)/ })`); `Start` in that list picks it too.
   - Axe test (`@a11y`, both projects): open the page and scan it; pick "Upper (chest)", click "Edit Upper (chest)", expect the dialog "Edit Sunday", scan; close it with "Cancel"; start the workout, scan.
2. [x] The workout flow and the cancel flow — files: `tests/e2e/gym.spec.ts` (change); tests: itself.
   - Workout test (desktop only): `startDay("Upper (chest)")`; the toast `Started "Upper (chest)"`; Undo through `andSettle` returns to the list (no set logged, so allowed), and after a reload there is no "Workout in progress" banner; start again. Open the exercise with its toggle button (`getByRole("button", { name: "Incline barbell press" })`, the `aria-expanded` one), fill `Value` with `60` (`getByLabel("Value")`; reps start at the day's minimum, 5), click "Log set" through `andSettle`; expect `Added set 1` and the line `Set 1:` with `5 reps × 60 kg`. Undo through `andSettle` removes the line; log again. "Finish workout" through `andSettle`: toast starting with `Finished the workout`, the History card says `1 workout` and, after a reload, still does (and no banner). Undo of the finish: do it in a second finish (finish, Undo through `andSettle`, expect the workout card back with the set), then reload: the banner "Workout in progress" with `1 set logged` shows and History says `0 workouts`; "Resume", finish again, reload; open the History entry `Upper (chest)` (button with `aria-expanded`) and expect `Incline barbell press` and `5 × 60 kg`.
   - Cancel test (desktop only): start, log a set as above, click "Cancel workout" (the question "Delete this workout and its sets?" shows), "Keep" (it hides, the workout stays); "Cancel workout" again, "Delete" through `andSettle`: toast `Cancelled the workout`, History says "No finished workouts yet.", no banner; Undo through `andSettle` brings the workout card back with `Set 1:`; reload: the banner shows `1 set logged`; "Resume", cancel and delete again, reload: no banner and an empty History.
   - Toasts: dismiss one with "Dismiss notification" before the step that makes the next Undo, as the Tasks spec does, so only one Undo button exists. Wait for each action's answer with `andSettle`, never by time; a step that sends two actions at once passes a body piece (`"setOrder":1`, `"sessionId"`) to tell them apart.
3. [x] The routine and the custom-exercise flows — files: `tests/e2e/gym.spec.ts` (change); tests: itself.
   - Routine test (desktop only): pick "Upper (chest)", "Edit Upper (chest)", dialog "Edit Sunday"; "New exercise" shows `New exercise` (label), fill it with a unique `E2E lift <8 hex>`, "Create and add" through `andSettle` (body piece `"name":"<name>"`); the routine in the dialog lists it as `8. <name>`; "Save" through `andSettle` (body piece `"name":"Upper (chest)"`): toast `Saved "Upper (chest)"`, the preview card of the day lists `8. <name>`; after a reload (pick the day again) the same. Undo of the save through `andSettle`: the preview no longer lists it, also after a reload.
   - Custom exercise test (desktop only): in the same editor create `E2E lift <8 hex>`, then close the dialog with "Cancel" (the exercise exists, the routine is not saved); "My exercises" lists it with a `1` count, also after a reload. `Delete <name>` through `andSettle`: row gone, toast `Removed "<name>"`, reload: the card says "No custom exercises yet."; Undo through `andSettle` (before the reload in a second pass): the row is back, also after a reload.
   - If a name is not found as written (a label, toast or region differs), read the real text in `app/gym/*.tsx` and use it; never loosen to a CSS selector. Never change app code to make a step pass unless it is a real bug, and then report it in the pull request.
4. [x] KB and docs — files: `docs/kb/conventions.md`, `docs/kb/architecture.md`, `docs/kb/status.md`, `docs/kb/log/2026-11.md`, `docs/kb/INDEX.md`, `docs/kb/decisions/general.md` (change); tests: `python3 .claude/skills/maintain-kb/scripts/kb_check.py docs/kb`.
5. [x] Verify and hand off — files: none; tests: `npm run check` and `npm run e2e` against a private database, then the merge-branch skill opens the pull request and CI is green. Do not merge it.

## Cleanup and docs
- Nothing becomes unused: no helper moves, nothing is replaced.
- `docs/kb/conventions.md`, End-to-end specs: list `tests/e2e/gym.spec.ts` with the other specs; update the run count to the total on the default branch at merge time (this spec adds 6 runs: 5 on `desktop`, 1 on `phone`); other specs added at the same time update the same line, so merge `origin/main` before the last edit.
- `docs/kb/architecture.md`, Tests section: add the Gym spec to the list of specs.
- `docs/kb/status.md`: Roadmap line "Gym e2e spec (`/gym`, D-014)" with the plan link while in progress, then done; archive the plan when done (`git mv` to `docs/kb/archive/plans/`).
- `docs/kb/decisions/general.md`: D-014; `docs/kb/log/2026-11.md`: an entry for the plan and one for the build; `docs/kb/INDEX.md`: the current-state line mentions the Gym spec.
- D-012's "Out of every variant" line names Gym as not covered: this plan covers Gym, so that line stays true for its own spec only (Tasks), and needs no edit.
- Risk tier: only `tests/**` and `docs/**` change, so Low.

## Approval
Status: done 2026-11-18
