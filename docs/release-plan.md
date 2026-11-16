# Release plan: both variants, from now to the presentation and the personal go-live

Status: **agreed by the user on 2026-11-10. Sections 3, 3b, 3c and 4 are done, variant B is live, section 5 (Azure) has had two live runs (2026-11-13, 2026-11-16) and has one final deploy left (2026-11-16).** Written 2026-11-10 after an audit of the code, the infra and the docs. It extends the free hosting plan of 2026-11-10 (stack, limits, verified claims), now removed (git history) and recorded in `docs/decisions.md`.

Principle: **deploy is the last step.** Nothing is deployed for real until every gate in section 6 passes. Each step is its own commit with its tests, and CI stays green.

## 1. The two deliverables (same code, selected by env)

| | A. Azure (the course) | B. Free personal |
|---|---|---|
| Goal | Meet `docs/requirements.md` and be presented in January | The app the user keeps using, free, no time limit |
| Hosting | Container Apps + PostgreSQL Flexible (private) + Key Vault + ACR, in `italynorth` | Vercel Hobby (`fra1`) + Neon Free (`eu-central-1`) |
| Login | Microsoft Entra | GitHub OAuth, owner allowlist |
| Lifetime | Ephemeral: deploy, demo, `azure-teardown.sh`, credit-limited | Permanent |
| Done when | Demo rehearsed, evidence for every requirement row, everything torn down | Gates in section 6 passed, first week of usage checked |

Order followed: shared code (3), then B (4), then A (5) close to the presentation so the credit is not spent early; each Azure rehearsal costs about 0.20 to 0.35 USD with immediate teardown.

## 2. Decisions needed from the user (before the code starts)

1. **Order: DECIDED 2026-11-10** as proposed: shared code, then B (free), then A (Azure) close to the presentation.
2. **Message queue (course requirement 5): DECIDED 2026-11-10.** Push is hidden behind `NEXT_PUBLIC_PUSH_ENABLED`, like Claude (off on B, on on A), not deleted. On A: an Azure Storage Queue, a scheduled Container Apps Job that enqueues due reminders, and a worker that sends the web push. Still to ask at implementation time: the `web-push` dependency and the VAPID keys (AGENTS.md: ask before adding a dependency). Needs a new `docs/threat-model.md` entry and a cost line before any deploy.
3. **Existing data: DECIDED 2026-11-10.** The user has real data, but it is not the one in the local database, and there is little of it. Step 4.4 stays, with the source and format still to be given by the user (to ask when B reaches that step); the local database is not imported.
4. **Session length: DECIDED 2026-11-10** (B only: 30 days, raised to 180 on 2026-11-12, with a recheck of the allowlist on every session read, as proposed; A keeps 4 hours). Reason: Now 4 hours with a 15-minute refresh, which logs a personal user out several times a day. Option for B only: 30 days, and recheck of the allowlist on every session read. Security trade-off, so the user decides.
5. **Public database on B: DECIDED 2026-11-10.** Accepted by the user (only the owner uses the app). Neon Free has no private endpoint, which breaks the course rule "no database reachable from the public internet"; for B it is a recorded, accepted risk with mitigations: TLS required, long random password, least-privilege app role, owner string only in GitHub secrets. Still to do: an entry in `docs/security/risk-register.md`. A (Azure) keeps the private database; the course rule is not relaxed there.
6. **GitHub account: DECIDED 2026-11-10.** The user's personal account is the owner (allowlist by numeric id) and holds the private repo and the backups.
7. **Presentation logistics: not needed for planning (user, 2026-11-10).** The user only has to show what was done, not give a formal presentation. The demo material in section 5 is scaled down accordingly. What is mandatory for A: every row of `docs/requirements.md` met, with evidence.
8. **Repository: stays private (DECIDED 2026-11-10).** No licence needed while it is private; the muscle model notice stays in `public/models`.
9. **Permanent URL.** Another address than the test project is possible: the user picks the Vercel project name (open, see section 9). It must be fixed before the GitHub OAuth app is created, because the callback URL and the installed PWA are tied to it.
10. **Azure prerequisites only the user can do: later (user, 2026-11-10).** Credit check before each deploy and a second Entra test account for the live "other user denied" test. Required before the Azure live check (section 5), not before the shared code.
11. **Unused things are deleted: DECIDED 2026-11-10.** Replaces "keep the unused tables". The repo keeps strictly what the app uses; old data and leftovers are removed; the project must be clean and production ready; a full audit and refactor closes the work (sections 3b and 3c).

## 3. Shared code (both variants)

Each item: do it, test it, commit.

**Status 2026-11-10 (branch `feat/shared-release-code`, PR open): items 1 to 11 done, with these deviations.** Item 8: `app/loading.tsx` not added (a root loading fallback would flash on every navigation and fight the page transitions; add it only if the measurements in 3c show a need). Item 13: errors on pages show Next's `digest`, the id that also appears in the server log next to the real error; routes and server actions got no extra logging yet (revisit in 3c). Found while verifying: `app/signin` only had the dev username form, so the sign-in page now shows "Continue with GitHub/Microsoft" for the configured provider and the access-denied message (`pages.signIn` and `pages.error` point to it); the desktop sidebar ignored the Settings flag and now uses the filtered links. Item 5: the history window is 370 days (same as `getGymHistory`); the split and the exercise list stay sequential because both seed the default exercises on a first visit.

1. **Flag `NEXT_PUBLIC_CLAUDE_ENABLED`** (decided 2026-11-10). Helper `isClaudeEnabled()`. Hides the Settings nav entry (`app/components/navigation.tsx`), the Settings page (`notFound()`), the Assistant tab and panel in `app/food/food-client.tsx`; `src/app/actions/claude-connection.ts` and `src/app/actions/food-chat.ts` throw when off. **Off on B (hidden); on A was planned as present (2026-11-10) but is superseded: off on A too (decisions 2026-11-13 and 2026-11-16), see section 5.** B cannot run it: Vercel cannot spawn a CLI. The flag is inlined at build time, so both the Azure image and the Vercel project set `false`. Tests for both states. `.env.example` documents it.
2. **Push flag `NEXT_PUBLIC_PUSH_ENABLED`** (decided). Hides the "enable reminders" button in `app/todos/todos-client.tsx` and rejects `savePushSubscriptionAction` when off; the `push` and `notificationclick` handlers in `public/sw.js` stay but are only reachable when a subscription exists. Tests for both states.
3. **Auth by env.** `AUTH_PROVIDER=azure-ad|github|dev`. The GitHub provider must not require any `AUTH_AZURE_*` variable (today `src/auth.ts` throws without them, outside the build phase). The allowlist is by the GitHub numeric id (immutable), not by name or email, and is checked in `signIn`; a user not on the list is denied before any `users` row is created. `AUTH_ISSUER` becomes `https://github.com` for GitHub. Entra stays as is. Tests: owner allowed, other GitHub user denied, anonymous denied; Entra path unchanged.
4. **Timezone** `Europe/Bucharest` through `Intl` in `toISODate()` and `getTodayString()` (works on a UTC container and on Vercel without `TZ`).
5. **Query fixes**: `getWorkoutHistory` date window instead of `limit(8000)`; `Promise.all` in `app/gym/page.tsx`; check Food and Tasks pages for sequential awaits.
6. **Session callback.** `src/auth.ts` runs `SELECT ... FROM users` on every session read, and there is no middleware, so every page render and every server action (`requireUser()`) pays one extra database round trip, which also wakes Neon. Change: trust the signed JWT for its (short) lifetime, no lookup (a deleted user stays valid until the token expires, accepted for a single-owner app); keep the lookup only if decision 4 picks the long session. Test that a request with a valid token still works and with none fails.
7. **Pool** (`src/server/db.ts`: `max: 5` today): `max` 1 to 2 on serverless, `idleTimeoutMillis` about 10 s, an `error` handler on the pool; read from env so A keeps its values.
8. **Error and empty pages**: add `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/loading.tsx` (none exist). They show a generic message and a request id, never a stack trace; follow the Wishlist design skill.
9. **Not indexable**: `app/robots.ts` disallowing everything and `robots: noindex` metadata (the sign-in page is public).
10. **Cache header for `public/models/muscles.glb`** (5.6 MB). The service worker caches only `/_next/static`, so the model is fetched again on every open; add `Cache-Control: public, max-age=31536000, immutable` for it (rename with a version suffix if it changes) so the CDN and the browser keep it.
11. **`scripts/db-init.cjs`**: remove the hard-coded default app password; require it from env.
12. **Dead code**: covered by section 3b. Claude and push stay behind flags. No new dependency without asking.
13. **Request id** in logs for errors on every route (today only `/api/weight` logs through `logRequest`), no personal data: on Vercel Hobby logs last 1 hour, so a failure must be traceable within that time.

## 3b. Cleanup: keep strictly what the app uses

**Done 2026-11-10** (PR #73 and #74 on `main`): unused tables dropped (migration `0019_drop_unused_tables`), legacy Money and Business code and dead exports removed, the old iteration docs, `docs/idea.md` and `docs/roadmap.md` deleted (git history is the archive), README rewritten, no env file or build output tracked. Detail and the list the user approved are in `docs/decisions.md` and git history.

## 3c. Final audit and refactor

**Done 2026-11-10 and 2026-11-11:** `ponytail-audit`, `secure-development` and `code-review-guide` passes, safe fixes committed, the open points decided by the user (`docs/decisions.md`, "Final audit 3c" and "Decisions on the 3c list"), the section 6 gates run again, ASVS matrix refreshed. The rule stays for later changes: gates are re-run after a refactor, and nothing deploys on results from before it.

## 4. Variant B: free personal (Vercel + Neon)

**Done 2026-11-10:** GitHub OAuth app, Vercel project `life-tracker` (Production-only secrets, Preview with none, Ignored Build Step), Neon Free with the restricted app role, owner-run migrations, weekly `age`-encrypted backup with a tested restore, exit plan (`Dockerfile` plus a dump). The Neon rehearsal branch was skipped by the user's choice. The runbook is in `README.md`; the go-live record is in `docs/decisions.md` ("Final audit 3c"). The data import is done by `scripts/import-personal.cjs` from the gitignored `.local/`; the local development database was never imported.

## 5. Variant A: Azure (everything for the presentation)

**Done:** the queue (requirement 5) and the observability resources are in `infra/main.bicep`; the security docs (ASVS matrix, threat model, data inventory, risk register, `docs/security/azure-hardening.md`) were refreshed; the demo material is `docs/presentation.md`, `docs/azure-requirements.md` and `docs/azure-one-pager.pdf`; the requirements table is `docs/requirements.md`.

**Live runs:** 2026-11-13 (rehearsal, `life-tracker-stage`, `italynorth`) and 2026-11-16 (full app: all 32 migrations (0000 to 0031) through the `Microsoft.App/jobs` migrate job, Entra sign-in, a real reminder on a phone, one record in each module, export). Both were torn down the same day; evidence is in `docs/azure-evidence/2026-11-16-live-run.md`. The 2026-11-16 run found and fixed three defects (schema from the Drizzle migrations, `public/` in the image, reminders delivered in the minute they are set). Per-run cost estimate: 0.20 to 0.35 USD (not measured here); before each deploy the estimate, the budget resource and same-day teardown still apply, and the soft-deleted Key Vaults purge on their own (check that names do not collide: purge protection keeps a name reserved).

**Decided as not done on Azure:**
- Backup and point-in-time restore on the Azure server (former item 5.5): not tested there, by decision 2026-11-16; the backup and restore test belong to the personal deploy.
- A second Entra test account for the live "other user denied" check: skipped by the user (2026-11-13); isolation is covered by the automated authorization tests.
- **Claude Assistant on A (former item 5.7, decided 2026-11-10): superseded 2026-11-16.** The Assistant stays off on Azure (`NEXT_PUBLIC_CLAUDE_ENABLED=false`, no CLI in the image, no health data to an AI provider). See `docs/decisions.md` (2026-11-13 and 2026-11-16).

**Still to do (one final full deploy, only when the user decides):** show live what was not yet seen: the three alert rules (fire one by stopping a replica), the four saved queries returning rows, the action-group e-mail and the budget; then the authorization and functionality walkthrough (`docs/azure-verification-plan.md`, Phase 2), mark each row in `docs/requirements.md`, and tear down (final sequence: preflight, what-if, deploy, migrate, show, teardown, confirm that only `NetworkWatcherRG` remains).

## 6. Pre-deploy gates (both variants; nothing deploys until all pass)

**Code and tests**
- Lint, typecheck, `npm test`, production build, container build and scan all green; no skipped or weakened check.
- New tests: flags on and off, provider selection, allowlist (owner, other user, anonymous), timezone around midnight and the DST change, `getWorkoutHistory` window.
- Authorization test for every endpoint and server action, including the Claude and push actions when off.
- Query-count test: each page's data load and each server action runs at most a fixed number of queries (set after the baseline, with the session lookup removed); a spy on the pool, so a regression is caught.

**Cost guards (the Free limits)**
- Zero polling: no timer in the app calls the server (verified: only the workout stopwatch runs on the client and makes no request); `/health` makes no query; no uptime monitor on a database route.
- Measure queries per page and per action with about 2 years of seeded data (extend `seed:dev`); `EXPLAIN (ANALYZE, BUFFERS)` on the slow ones; add `(user_id, ...)` indexes only where a scan appears on a growing table.
- Actions that call `revalidatePath` re-run the whole page's queries (five action files do): measure, and where the client can update its own state, return the changed rows instead.
- Aggregate in SQL instead of shipping thousands of rows (Neon egress limit 5 GB a month).
- Budget to check after a week and then every few months: Neon CU-hours (limit 100, expected 19 to 60), storage (1 GB), egress (5 GB); Vercel invocations (1,000,000), Active CPU (4 h), transfer (100 GB). Neon Free has no overage, so a limit means suspended compute, not a bill; Vercel pauses usage for 30 days.

**Security**
- ASVS L2 pass for everything shipped; secret scan clean; `npm audit` clean; Dependabot PRs merged or explained.
- Headers on the real host (CSP still works with the Next.js inline scripts, HSTS, frame denial); cookie is `__Host-` with Secure on `https`.
- `NEXTAUTH_SECRET` and every secret generated fresh, never reused from the Azure or test values; the placeholder values on the test Vercel project replaced.
- Sign-in rate limiting: the allowlist already limits who can get in; check what the Vercel Firewall allows on Hobby before adding anything.
- Docs updated in the same pull requests: threat model, data inventory, risk register, ASVS matrix.

**Quality**
- UI: the accessibility checklist of the apple-design skill and the Wishlist-based house style for every screen touched (including the new error and not-found pages).
- Smoke test on a phone (the real use): install the PWA from the real URL, sign in, add one record per module, reload, sign out; manifest, icons, start URL and cookies behave in the installed app.
- Lighthouse on `/gym`, `/food`, `/todos` (phone profile); first request after the database slept in about 2 s or less (target, confirmed with the baseline), a warm page under 1 s, `/gym` with 2 years of data flat in time and payload.

**Operations**
- Runbook in the README: deploy, roll back (Vercel instant rollback; database restore from backup or Neon's 6 hours), rotate secrets, what to do if Neon or Vercel changes the Free plan, how to read the logs within the hour.
- A restore from the encrypted backup done once successfully.

## 7. Order of work

**Done:** the user's answers (section 2), shared code (3), cleanup (3b), baseline measurements (2026-11-10, PR #74), final audit (3c), Variant B go-live (4, 2026-11-10), Azure rehearsals (2026-11-13 and 2026-11-16).

**Left:**
1. One final full Azure deploy, when the user decides (section 5, "Still to do"); then tear down.
2. After the course: only B stays running; the Azure code and scripts stay in the repo.

## 8. What is deliberately not done

- No keep-awake pings for Neon (it would burn the CU-hours).
- No custom domain, no paid tier, no card on file.
- No new feature: the spec is frozen for this release.
- No kept-but-unused code, tables or docs "just in case": git history is the archive (section 3b).
- No Azure resource is created without the user's explicit OK in that session.

## 9. Open questions for the user

a. ~~Claude integration~~ **Decided 2026-11-10: hidden on B, present on A; superseded 2026-11-16: off on A too.** The code and table stay behind the flag.
b. ~~Cleanup list~~ **Approved 2026-11-10** (section 3b).
c. ~~Live app name~~ **Chosen:** `life-tracker-robo.vercel.app`.
