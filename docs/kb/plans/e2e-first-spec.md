---
summary: Plan for the first end-to-end spec: Playwright Test on the Wishlist flow (sign in, add, undo, delete, undo), run locally and in CI.
last_verified: 2026-11-18
---

# Plan: e2e-first-spec

## Goal
Life Tracker has only Vitest tests, so nothing checks that the real UI works in a browser: sign-in, a server action, the optimistic list and the Undo toast. This adds the first end-to-end spec, for the owner and for every later UI change, on the Wishlist page (the reference page).

## Scope
- In: Playwright Test and `@axe-core/playwright` as devDependencies (approved by the owner on 2026-11-18); `playwright.config.ts` with two Chromium projects (`desktop`, `phone` at 375 px) and a `webServer`; one spec file, `tests/e2e/wishlist.spec.ts`, with two tests; the `npm run e2e` script; a CI step; the KB updates.
- In: one-time download of Playwright's Chromium (about 150 MB from Playwright's CDN) on the owner's Mac and on every CI run; approving this plan approves that download.
- Out: Firefox and WebKit projects; screenshot tests; specs for any other page (Tasks, Gym, Food and health, Settings); fixing UI accessibility problems axe finds (they are listed to the owner and excluded with a comment, see Risks); changing app code, auth code or `next.config.ts`; adding e2e to `npm run check`; a production-build run; any use of the live database.

## Done criteria
- [ ] `npm run e2e` passes with `docker compose up` Postgres running, on both projects (4 tests: 2 tests × 2 projects) — checked by running it and reading `4 passed`.
- [ ] The spec covers: an anonymous visit to `/wishlist` redirects to `/signin`; a signed-in dev user adds an item and sees its row and the updated "Estimated Investment" total; Undo removes it; after adding again, Delete removes the row and Undo brings it back — checked by the spec's own assertions.
- [ ] axe finds no serious or critical violation on `/signin` and `/wishlist`, except ones listed in `tests/e2e/wishlist.spec.ts` with a comment naming the issue, after the owner was told of them (see step 1) — checked by the spec.
- [ ] The spec makes no waits by time and finds elements by role, label or text only — checked by `grep -rn "waitForTimeout\|locator(" tests/e2e` finding nothing.
- [ ] `npm run check` still passes and its Vitest run does not pick up `tests/e2e/` — checked by the test file count in the Vitest output being the same as on `main`.
- [ ] The CI job runs `npm run e2e` after the fast checks and is green on the pull request — checked on the PR's CI run; the report upload step has `if: failure()` — checked by reading the workflow diff.
- [ ] KB updated: D-005 active, conventions, architecture, status, log — checked by `python3 .claude/skills/maintain-kb/scripts/kb_check.py docs/kb` with no errors.

## Decisions
- D-005: Playwright Test on `next dev`, Chromium desktop and phone, axe, `npm run e2e` separate from `npm run check`

## Steps
1. [x] Spike: add the dependencies, install Chromium, and prove the server setup (see Risks) — files: `package.json` (change), `package-lock.json` (change), `playwright.config.ts` (create, a first version that step 2 finishes), `tests/e2e/scratch.spec.ts` (create, deleted at the end of this step); tests: `npx playwright test` on the scratch spec; the findings are written into this page's Risks and spikes before step 2 starts.
   - Run `npm install -D @playwright/test @axe-core/playwright`, then `npx playwright install chromium`.
   - Migrate the local test database (on a fresh Docker volume it has no tables; the command is a no-op when it is current): `(set -a; . ./.env.example; DATABASE_URL_MIGRATE="postgresql://postgres:$POSTGRES_PASSWORD@127.0.0.1:5432/life_tracker_test" npm run db:migrate)`. This is the local Docker database only, never the live one.
   - Start `npx next dev --port 3100` with `AUTH_DEV=true`, `NEXTAUTH_URL=http://localhost:3100`, `NEXTAUTH_SECRET=e2e-only-secret` and `DATABASE_URL` set to the test URL from `.env.example`; sign in with a unique username and open `/wishlist`.
   - Note the cold-compile time of `/signin`, `/food` and `/wishlist`, what happens when `npm run dev` already runs on port 3000, and what axe reports on both pages.
   - **Stop here.** If axe reports serious or critical violations, tell the owner what they are and ask whether to exclude them with a comment (the plan's default) before step 3. When the owner is away (conventions, "When the user is away"), exclude them, and list them in the PR body and the KB log.
2. [x] Config and wiring — files: `playwright.config.ts` (change), `package.json` (change: script `"e2e": "playwright test"`), `vitest.config.mjs` (change: add `tests/e2e/**` to `exclude`), `.gitignore` (change: `test-results/`, `playwright-report/`), `.dockerignore` (change: the same two paths, because the Dockerfile does `COPY . .`), `eslint.config.mjs` (change: add the same two paths to `globalIgnores`, so a leftover report is never linted); tests: `npm run lint`, `npm run typecheck`, `npm test` (same file count as before).
   - `testDir: "tests/e2e"`, `retries: 0`, `trace: "retain-on-failure"`, headless, `fullyParallel: false`, `workers: 1` (one dev server, one database), reporter `line` locally and `html` in CI, `use.baseURL: "http://localhost:3100"`.
   - Projects: `desktop` (Desktop Chrome) and `phone` (Chromium, viewport 375×812, no touch or mobile emulation: the target is the width).
   - `webServer`: command `npx next dev --port 3100`, url `http://localhost:3100/signin`, `reuseExistingServer: false`, a `webServer` timeout, test timeout, `expect.timeout`, `navigationTimeout` and `actionTimeout` long enough for the first on-demand compile of sign-in, `/food`, `/wishlist` and the first server action (all set from the spike's measurements; Playwright's `expect` default of 5 s is not enough for a cold dev server), env `AUTH_DEV=true`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and `DATABASE_URL`: in CI the job's own `DATABASE_URL`, otherwise `DATABASE_URL_TEST` or the same default as `tests/setup.ts`.
   - The config throws when the database host is not `127.0.0.1` or `localhost`: a developer's `.env` can hold the live Neon URLs, and a spec must never touch them (added after the spike; the process env that `webServer` sets wins over `.env`).
   - If another `next dev` holds the project's dev lock, `npm run e2e` fails at start with Next's own message. It does not stop the other server; the conventions Gotcha tells the reader to stop it first.
3. [x] The spec — files: `tests/e2e/wishlist.spec.ts` (create); tests: `npm run e2e` (both projects pass, then run again to prove it repeats).
   - Test 1, anonymous: open `/wishlist`, expect the URL to be `/signin`; axe scan of the sign-in page.
   - Test 2, signed in: a helper in the same file signs in through NextAuth's `/api/auth/csrf` and `/api/auth/callback/credentials` endpoints (not the `/signin` form, see the sign-in race under Risks and spikes) with a unique name (`e2e-<random>`) and checks that `/food` loads before the test goes to `/wishlist`. On the Wishlist it scans with axe, adds an item with a unique name and the price 1234 through the "Add item" button, the "Name" and "Price (RON)" fields and the button "Save" (it reads "Saving..." while busy), expects the row, the toast `Added "<name>" (1.234 RON)` and the total `1.234` (formatted in `ro-RO`, so with a dot) inside `getByRole("region", { name: "Estimated Investment" })` with `toContainText` (the same text also appears in the row badge and the toast, so a bare `getByText` is ambiguous), clicks Undo and expects the row gone and, in the same region, the total back to `0`, adds again, dismisses the lingering "Added" toast with its "Dismiss notification" button so only one Undo exists, deletes with the row's button labelled "Delete" plus the item name, and clicks Undo to expect the row back.
   - Selectors are `getByRole`, `getByLabel` and `getByText` with `exact: true` where a label is a prefix of another ("Name"); assertions use Playwright's auto-retrying `expect` (the total counts up over about 600 ms); no `waitForTimeout`; the test creates its own user and item and depends on nothing else.
4. [x] CI step — files: `.github/workflows/ci.yml` (change); tests: the pull request's CI run (the new steps pass; a deliberately failing run is not needed).
   - After "Fast checks": a step `npx playwright install --with-deps chromium`, a step `npm run e2e`, and an `actions/upload-artifact` step with `if: failure()` for `playwright-report/` and `test-results/`, using the same pinned artifact action SHA already in this file.
   - The job-level `DATABASE_URL` and `AUTH_DEV` already exist; `NEXTAUTH_SECRET` is already set. No new secret.
5. [x] KB and docs — files: `CLAUDE.md` (change: one line in Commands), `docs/kb/conventions.md`, `docs/kb/architecture.md`, `docs/kb/status.md`, `docs/kb/log/2026-11.md`, `docs/kb/INDEX.md` (change); tests: `python3 .claude/skills/maintain-kb/scripts/kb_check.py docs/kb`.
6. [ ] Verify and hand off — files: none; tests: `npm run check`, `npm run e2e`, then the merge-branch skill opens the pull request and CI is green.

## Cleanup and docs
- Nothing becomes unused: no code, file or dependency is replaced. The scratch spec from step 1 is deleted in the same step.
- `docs/kb/conventions.md`: replace "One end-to-end spec: none yet" with the one command (`npm run e2e`), the preconditions (`docker compose up`, the test database migrated with the command from step 1, Chromium installed once with `npx playwright install chromium`), and the targets. Add Gotchas: `AUTH_DEV` forbids a production build, so e2e runs on `next dev` on port 3100 and fails to start while another `next dev` holds the project's dev lock (stop it first; confirmed or corrected by the spike); Vitest excludes `tests/e2e/**`. Note that `tests/e2e/` and two Chromium projects deviate from the verify skill's generic `e2e/` folder and three browsers, and that this page wins for this project. Also note that CI runs `npm run e2e` after the fast checks, although the merge-branch `setup-github.md` reference and the verify skill's tier table say CI runs only the fast checks: the skills are generic, so they stay unchanged and the next session must not "fix" CI back.
- Review tier: `.github/workflows/ci.yml` is in the High risk list, so review-change treats the pull request as High; expect the deeper review.
- `CLAUDE.md`, Commands list: add `npm run e2e` (a doc line, not a rule change; the owner approves it with this plan). The stack line stays: Playwright is a dev tool, recorded in D-005.
- `docs/kb/architecture.md`, Tests section and the CI line: add the e2e run, its server and database.
- `docs/kb/status.md`: remove the "In progress" line for this feature (it moves to the Roadmap as "First e2e spec (Wishlist) — done", linking the plan until it is archived). Next step 1 there is the picomatch item and stays.
- `docs/kb/decisions/general.md`: D-002's Status line already points to D-005 (done when the plan was written).
- `docs/kb/log/2026-11.md`: the "First e2e spec: plan" entry is updated at the end with what was built, the PR and the axe findings; its "Next" line is replaced. `docs/kb/INDEX.md`: current-state line mentions the e2e spec.
- When done: set `Status: done`, `git mv` this page to `docs/kb/archive/plans/`, and run audit-project and merge-branch as the project's rules say.

## Risks and spikes
- `next dev` may refuse to start beside the owner's own `npm run dev` (dev lock in the same project folder), or the port may clash — settled by step 1; the answer is that `npm run e2e` fails early with Next's message and the Gotchas say to stop `npm run dev` first. The plan is changed with the owner's OK only if the spike shows something worse.
- The first compile of `/signin` and `/wishlist` in dev mode is slow and could time out the first test — settled by step 1, which measures it and sets the `webServer` and navigation timeouts in step 2.
- axe may report existing serious or critical violations on the sign-in or Wishlist page — settled by step 1, which stops and tells the owner; fixing them is a separate change, and step 3 excludes each with a comment naming it, never by dropping the scan.
- The spike's findings (compile times, dev lock, axe results) change steps 2 and 3 (timeouts, exclusions, Gotchas): step 1 writes them as bullets under this heading before step 2 starts.
- The Chromium build Playwright wants may differ from the one cached on the owner's Mac (`chromium-1255`) — settled by step 1 (`playwright install chromium` downloads the right one).
- Spike findings (2026-11-18, Playwright 1.65.1, Chromium, Next 16.4.5 Turbopack, local Docker test database):
  - Dev lock confirmed: with `next dev` already running on port 3000, `npm run e2e` fails at start with Next's "Another next dev server is already running" (PID and the `kill` hint) and "Process from config.webServer was not able to start". Nothing else breaks; the Gotcha stands as planned.
  - Compile times are small: from an empty `.next`, `/signin` loaded in about 1.5 s, `/food` after sign-in at about 3 s, `/wishlist` at about 3.5 s, the first add at about 4 s (whole test 6.6 s). The planned timeouts (test 60 s, `expect` 15 s, `actionTimeout` 15 s, `navigationTimeout` 60 s, `webServer` 120 s) leave room for a slower CI runner.
  - axe (all default rules, desktop project) found no violations on `/signin` or `/wishlist`, so no exclusions are needed and nobody had to be asked.
  - **Sign-in race:** right after `goto("/signin")` the page makes two parallel `/api/auth/session` calls (the dev double effect); each sets its own `next-auth.csrf-token` cookie, so a click on "Continue" before they finish posts a stale CSRF token. NextAuth answers 200 with `?csrf=true` and no session cookie, the form still pushes to `/food`, and the next page bounces back to `/signin`. The first build waited with `networkidle`, a timing guess; review replaced it. The sign-in helper in step 3 now gets the token from `/api/auth/csrf` and posts it to `/api/auth/callback/credentials` in the same cookie jar, then asserts `/food` loads with `toHaveURL`. The form submit itself is not exercised by this spec. This is a test-timing issue only; app code is unchanged.
- Test users stay in `life_tracker_test` between runs; harmless, because unique names are used and Vitest's `todos.test.ts` truncates `users` anyway. In CI the database is new on every run.

## Approval
Status: approved 2026-11-18
