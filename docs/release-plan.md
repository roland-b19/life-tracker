# Release plan: both variants, from now to the presentation and the personal go-live

Status: **proposed, waits for the user's OK. Nothing in it is implemented.** Written 2026-11-10 after an audit of the code, the infra and the docs. It extends `docs/free-hosting-plan.md` (stack, limits, verified claims) and replaces its short "Implementation plan".

Principle: **deploy is the last step.** Nothing is deployed for real until every gate in section 6 passes. Each step is its own commit with its tests, and CI stays green.

## 1. The two deliverables (same code, selected by env)

| | A. Azure (the course) | B. Free personal |
|---|---|---|
| Goal | Meet `docs/requirements.md` and be presented in January | The app the user keeps using, free, no time limit |
| Hosting | Container Apps + PostgreSQL Flexible (private) + Key Vault + ACR, in `italynorth` | Vercel Hobby (`fra1`) + Neon Free (`eu-central-1`) |
| Login | Microsoft Entra | GitHub OAuth, owner allowlist |
| Lifetime | Ephemeral: deploy, demo, `azure-teardown.sh`, credit-limited | Permanent |
| Done when | Demo rehearsed, evidence for every requirement row, everything torn down | Gates in section 6 passed, first week of usage checked |

Order proposal: shared code (3), then B (4), because it is free and exercises the new code for real; then A (5), close to the presentation so the credit is not spent early; each Azure rehearsal costs about 0.20 to 0.35 USD with immediate teardown.

## 2. Decisions needed from the user (before the code starts)

1. **Order: DECIDED 2026-11-10** as proposed: shared code, then B (free), then A (Azure) close to the presentation.
2. **Message queue (course requirement 5): DECIDED 2026-11-10.** Push is hidden behind `NEXT_PUBLIC_PUSH_ENABLED`, like Claude (off on B, on on A), not deleted. On A: an Azure Storage Queue, a scheduled Container Apps Job that enqueues due reminders, and a worker that sends the web push. Still to ask at implementation time: the `web-push` dependency and the VAPID keys (AGENTS.md: ask before adding a dependency). Needs a new `docs/threat-model.md` entry and a cost line before any deploy.
3. **Existing data: DECIDED 2026-11-10.** The user has real data, but it is not the one in the local database, and there is little of it. Step 4.4 stays, with the source and format still to be given by the user (to ask when B reaches that step); the local database is not imported.
4. **Session length: DECIDED 2026-11-10** (B only: 30 days with a recheck of the allowlist on every session read, as proposed; A keeps 4 hours). Reason: Now 4 hours with a 15-minute refresh, which logs a personal user out several times a day. Option for B only: 30 days, and recheck of the allowlist on every session read. Security trade-off, so the user decides.
5. **Public database on B: DECIDED 2026-11-10.** Accepted by the user (only the owner uses the app). Neon Free has no private endpoint, which breaks the course rule "no database reachable from the public internet"; for B it is a recorded, accepted risk with mitigations: TLS required, long random password, least-privilege app role, owner string only in GitHub secrets. Still to do: an entry in `docs/security/risk-register.md`. A (Azure) keeps the private database; the course rule is not relaxed there.
6. **GitHub account: DECIDED 2026-11-10.** The user's personal account is the owner (allowlist by numeric id) and holds the private repo and the backups.
7. **Presentation logistics: not needed for planning (user, 2026-11-10).** The user only has to show what was done, not give a formal presentation. Package 5.10 is scaled down accordingly. What is mandatory for A: every row of `docs/requirements.md` met, with evidence.
8. **Repository: stays private (DECIDED 2026-11-10).** No licence needed while it is private; the muscle model notice stays in `public/models`.
9. **Permanent URL.** Another address than the test project is possible: the user picks the Vercel project name (open, see section 9). It must be fixed before the GitHub OAuth app is created, because the callback URL and the installed PWA are tied to it.
10. **Azure prerequisites only the user can do: later (user, 2026-11-10).** Credit check before each deploy and a second Entra test account for the live "other user denied" test. Required before the Azure live check (5.3), not before the shared code.
11. **Unused things are deleted: DECIDED 2026-11-10.** Replaces "keep the unused tables". The repo keeps strictly what the app uses; old data and leftovers are removed; the project must be clean and production ready; a full audit and refactor closes the work (sections 3b and 3c).

## 3. Shared code (both variants)

Each item: do it, test it, commit.

1. **Flag `NEXT_PUBLIC_CLAUDE_ENABLED`** (decided 2026-11-10). Helper `isClaudeEnabled()`. Hides the Settings nav entry (`app/components/navigation.tsx`), the Settings page (`notFound()`), the Assistant tab and panel in `app/food/food-client.tsx`; `src/app/actions/claude-connection.ts` and `src/app/actions/food-chat.ts` throw when off. **Off on B (hidden), on on A (present), decided 2026-11-10.** B cannot run it: Vercel cannot spawn a CLI. A needs the work in section 5.7. The flag is inlined at build time, so the Azure image is built with `NEXT_PUBLIC_CLAUDE_ENABLED=true` (Docker build arg) and the Vercel project sets `false`. Tests for both states. `.env.example` documents it.
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

## 3b. Cleanup: keep strictly what the app uses (decided 2026-11-10)

Nothing is deleted before the user approves the list in section 9 (question b). Git history is the archive, so a deleted file is never lost; for the database a `pg_dump` is taken first.

1. **Unused tables.** Zero code use outside `src/db/schema.ts` today: `meal_plans`, `meal_plan_days`, `expense_categories`, `api_tokens`, `business_incomes`; `expenses` is only referenced by `scripts/db-init.cjs`. `claude_connections` stays (Claude is kept: present on A, hidden on B). `push_subscriptions` stays (push stays, Azure uses it). One new migration drops them (after the dump), schema entries and `scripts/db-init.cjs` references are removed, the grants stay consistent, and the migration is run on a throwaway database first (as done for 0000 to 0018).
2. **Legacy code.** Everything left from the removed Money and Business modules (components, actions, queries, validation schemas, seed data, tests), found with graphify plus a dead-export and unused-dependency check. No dependency is removed or added without telling the user.
3. **Old and local data.** The local database is not imported anywhere; seed and fixture data that nothing uses is deleted; `seed:dev` stays only if tests or the baseline measurements need it.
4. **Docs.** Candidates for deletion (to approve): `docs/iteration-1.md` to `docs/iteration-8.md`, `docs/idea.md`, and any plan file whose content is already in `docs/STATUS.md`, `docs/decisions.md` or `docs/release-plan.md`. Kept: AGENTS.md, `GEMINI.md`, `.github/copilot-instructions.md` and `.gemini` (AGENTS.md requires them), requirements, decisions, threat model, security docs.
5. **Repo hygiene.** README rewritten for what exists (what it is, the two variants, runbook); no tracked build output, junk or env file except `.env.example`; `.claude/launch.json` stays untracked.

## 3c. Final audit and refactor (last step before any real deploy)

After sections 3, 3b and the measurements, and before B goes live or Azure is deployed:

1. Whole-repo audit with `ponytail-audit` (bugs, security, load, untested risky code, what to delete, merge or split), plus a security pass with `secure-development` and a review of the full diff with `code-review-guide`.
2. Refactor what the audit finds, in small commits: duplicated code, oversized files and components, inconsistent patterns, dead exports, naming; no behaviour change and no new feature.
3. **Every gate in section 6 is run again after the refactor**, because the refactor can break what was already verified. Nothing deploys on results from before it.
4. `docs/STATUS.md` and the ASVS matrix are refreshed from this final state.

## 4. Variant B: free personal (Vercel + Neon)

1. **GitHub OAuth app** (user creates it; the callback is `https://<domain>/api/auth/callback/github`, scope `read:user` only). Secret goes straight into Vercel, never into chat. 2FA on for GitHub, Vercel and Neon (their logins are a path to the data).
2. **Vercel project.** Reuse the test project `life-tracker` (replace the placeholder values) or recreate it. Function Region `fra1` (already chosen). Environment variables, all marked Sensitive:
   - Production only: `DATABASE_URL` (Neon pooled host, role `life_tracker_app`), `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (32 random bytes), `AUTH_PROVIDER=github`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `OWNER_ALLOWLIST`.
   - **Preview and Development get no database and no auth secrets.** Otherwise every pull-request preview would run against the production data. Prefer turning off preview deployments for pull requests (also saves the 100 deployments a day and build minutes); check Deployment Protection on the Hobby plan.
   - Build placeholders only for what the build still needs (after 3.3 none for Azure).
3. **Neon.** Create `life_tracker_app` with a real password (verified possible on 2026-11-10). Migrations with the owner string (`DATABASE_URL_UNPOOLED`) from a manual GitHub Action (`workflow_dispatch`, protected environment) or locally; never in the Vercel build. Migrations must be additive (expand, then contract), because Vercel deploys on push independently of the migration run; run the migration before merging code that needs it.
4. **Data import** (only if decision 3 says so): `pg_dump --data-only` of the local database, restore into Neon with the owner remapped, counts compared table by table.
5. **Backups.** Weekly GitHub Action: `pg_dump`, encrypted with `age` (public key in the repo, the private key kept offline by the user, never in GitHub), stored as an artifact with 90-day retention (artifact storage counts against the account quota; keep dumps small). The user also downloads one copy now and then. Restore tested once into a local Postgres before go-live, then quarterly.
6. **Rehearsal on a Neon branch** (a branch of `production`, free within the 10-branch limit, needs the user's OK): run the migrations, the import and the restore there first, measure the cold-start time, delete the branch.
7. **Exit plan** kept working: `Dockerfile` plus the dump run on any host.

## 5. Variant A: Azure (everything for the presentation)

Audit result: the Azure side was verified live only for the Iteration 2 weigh-in slice. The app has grown (Gym, Food, To-do, Wishlist) and has never been deployed whole. Nothing below is assumed to work.

1. **Course requirements table** (`docs/requirements.md`): every row still says "open". **Gate for A: every one of the 8 rows is ticked with evidence (a file, a command output, a screenshot or a live check) before the final deploy is called done.** Fill it as evidence is produced, and re-read the whole file at the end so no requirement is missed.
2. **Requirement 5, queue** (decided: yes): Bicep adds a storage account (no public access, private endpoint or firewall, managed identity), a queue, a scheduled Job and the worker, plus their ASVS, threat-model and cost entries.
3. **Full-app redeploy and live check**, not only `/health`: all 19 migrations through the `Microsoft.App/jobs` job, then, with the real Entra account: sign in, create one record in each module (weight, workout, meal, task, wishlist item), reload, sign out. Also the live authorization test (owner allowed, other account denied, anonymous denied), which needs a second Entra test account.
4. **Entra end to end.** Only the redirect to Microsoft was verified; the return leg (callback, `users` row created, session cookie `__Host-`, sign-out) is not.
5. **Backup and point-in-time restore** (listed as unverified in STATUS): run once on the live PostgreSQL during a rehearsal, show it in the demo or in the report, then tear down. A restore creates a new server and costs a little.
6. **Cost.** Before each deploy: an estimate in chat (24/7 about 80 to 100 USD, a 1 to 2 hour run about 0.20 to 0.35 USD), the budget alert resource, and teardown the same day. The six soft-deleted Key Vaults purge on 2027-02-01; check that the deploy script uses names that do not collide (purge protection keeps a name reserved).
7. **Claude present on A (decided 2026-11-10).** Today the image has no `claude` binary and `infra/main.bicep` has no `CLAUDE_TOKEN_KEY`, so it would show a broken tab. To do: install the Claude Code CLI in the Dockerfile (a new package in the image: ask the user first, pin the version, scan the image), make it work as the non-root `nextjs` user with a writable home, add `CLAUDE_TOKEN_KEY` (Key Vault, referenced by the container app) and `CLAUDE_MODEL`, allow outbound HTTPS to Anthropic from the container (check the VNet and egress rules), set the build arg `NEXT_PUBLIC_CLAUDE_ENABLED=true`, and verify live: connect a token in Settings, send one Assistant message. Entries in `docs/threat-model.md` and `docs/security/data-inventory.md` (Anthropic as processor of food and meal data only; no health data, standing decision), plus a cost line. The `/health` probe stays free of any database query.
8. **Security evidence refresh.** `docs/security/asvs-matrix.md` is from 2026-11-03 and covers only the weigh-in slice: redo it for every module. Update `docs/threat-model.md`, `docs/security/data-inventory.md` (GitHub as a second identity provider, Neon and Vercel as processors for B, Wishlist, To-do, the Claude token) and `docs/security/risk-register.md` (public Neon database accepted for B, Free-plan terms changing). No health data goes to an AI provider (standing decision).
9. **Azure hardening doc** (`docs/security/azure-hardening.md`) checked against what the Bicep really does.
10. **Demo material (scaled down; the user only shows what was done, no formal presentation).** One architecture diagram, a short requirement-by-requirement evidence list taken from `docs/requirements.md`, the security points (private DB, Key Vault, managed identity, authn plus authz, tests), the cost and teardown story, and a screen recording of one good run as a fallback if Azure misbehaves. Credit fallback: Azure Free Account (in `docs/requirements.md`).
11. **Final deploy sequence**: preflight, what-if, deploy, migrate, show, teardown, confirm the resource group list is empty (only `NetworkWatcherRG` remains, not ours).

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

1. User answers section 2.
2. Section 3 (shared code), small commits.
3. Section 3b (cleanup, after the user approves the list).
4. Baseline measurements and the cost-guard fixes (section 6 cost guards).
5. Section 3c: final audit and refactor, then all section 6 gates again. Nothing deploys before this.
6. Section 4 up to the rehearsal on a Neon branch; then B go-live and one week of watching usage.
7. Section 5, rehearsal deploys on Azure (each torn down the same day), evidence collected as it is produced; the final deploy only when all 8 requirement rows are ticked.
8. After the course: only B stays running; the Azure code and scripts stay in the repo.

Sizes (guess): shared code about 2 to 3 days, B about 1 to 2 days plus the wait for usage data, A about 3 to 4 days plus the presentation. Nothing was measured.

## 8. What is deliberately not done

- No keep-awake pings for Neon (it would burn the CU-hours).
- No custom domain, no paid tier, no card on file.
- No new feature: the spec is frozen for this release.
- No kept-but-unused code, tables or docs "just in case": git history is the archive (section 3b).
- No Azure resource is created without the user's explicit OK in that session.

## 9. Open questions for the user

a. ~~Claude integration~~ **Decided 2026-11-10: hidden on B, present on A.** Not deleted; its code and table are used by A. Work in section 5.7.
b. **Cleanup list** (Claude is out of it) in section 3b: approve it (or edit it) before anything is deleted.
c. **Live app name** for `<name>.vercel.app`: to be chosen before the GitHub OAuth app is created.
