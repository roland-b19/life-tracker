# Free personal hosting plan (phase 2)

Status: **plan only, nothing implemented.** Decided 2026-11-10 (see `docs/decisions.md`). The Azure variant stays as it is; this is a second, env-selected way to run the same code.

## Target stack (all free tiers, no card where possible)

- Vercel Hobby (serverless Next.js, `*.vercel.app` domain), personal and non-commercial use only.
- Neon Free (Postgres: 1 GB per project and 20 GB per account, 100 CU-hours per project per month, 5 GB egress per month, compute suspends after 5 min idle and this cannot be turned off, 6 hours of instant restore, no spending alerts). Figures from the official Neon plans page, read 2026-11-10.
- GitHub OAuth login, with an owner allowlist. The Entra provider stays in `src/auth.ts` and is picked by env.
- GitHub Actions (private repo, 2000 min/month) for the backup.

## Decided, so no longer open

| # | Item | Resolution |
|---|---|---|
| 1 | Claude integration | Deleted, so the app runs serverless (`claude-cli.ts`, `claude-connection.ts`, `food-ai-chat.ts`, Settings page, Assistant UI, their tests, `CLAUDE_TOKEN_KEY`, `CLAUDE_MODEL`). Table stays unused. |
| 2 | Real push notifications | Deleted: the `savePushSubscription` action, `pushSubscriptionSchema`, the "enable reminders" button in `todos-client.tsx`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. No server code ever sent a push, so nothing is lost. The `push_subscriptions` table stays unused (no migration). |
| 3 | Custom domain | Not needed: `*.vercel.app`. |
| 4 | Keeping the database awake | Not done, on purpose (see "Waking the database"). |
| 5 | Backups | Scheduled `pg_dump` in GitHub Actions, encrypted before it is stored. |

## Why `/health` must not query the database

Something calls `/health` on a timer to ask "is the app alive?": the Docker `HEALTHCHECK` every 30 s and the Azure container probe in `infra/main.bicep`. Vercel calls nothing; only an uptime monitor we add would. A Neon query resumes the compute and starts the CU-hour meter, and it stays on for 5 minutes after the last query. A `/health` that ran `SELECT 1` and was called every 30 s would keep the database awake all month (about 180 CU-hours at 0.25 CU, over the 100 free). Today `/health` only returns `{status:"ok"}`, so it proves the app is up, not that the database is. If a real database check is ever wanted, make it a separate endpoint that nothing polls (the `/api/warm` below).

## Waking the database

Neon Free suspends compute after 5 minutes without queries; the next query resumes it in a few hundred milliseconds (reported 300-500 ms). Never ping on a timer: an always-awake compute (0.25 CU minimum, our assumption) would use about 180 CU-hours a month, above the 100 free.

- Default: do nothing. One slow first request after a break is fine for one user.
- Optional, cheap: a `GET /api/warm` that runs `SELECT 1`, called when the sign-in page opens. The OAuth round trip takes seconds, so the database is awake before the first page needs it. Keep `/health` DB-free so an uptime monitor never wakes it.
- The weekly backup wakes it once. That is the only scheduled wake.
- Cost of a wake: at least 5 min x 0.25 CU = about 0.02 CU-hours. Fifty wakes a day is about 30 CU-hours a month.

## Must change in code before it works (not started)

1. Owner allowlist in the `signIn` callback (today any authenticated account gets a `users` row), and remap the `owner` row to the GitHub `(issuer, subject)`.
2. A fixed timezone in code (`Europe/Bucharest` through `Intl`), replacing the server-local time in `toISODate()` and `getTodayString()`. Do not rely on `TZ`: AWS Lambda-based hosts reserve it (to verify on Vercel).
3. `getWorkoutHistory`: date window or paging instead of `limit(8000)` over all time; today it silently drops the oldest sets after about 2 years.
4. `app/gym/page.tsx`: its six queries run one after another; run the independent ones with `Promise.all`.
5. Neon pooled connection string, same region for the Vercel functions and the database.
6. `scripts/db-init.cjs`: remove the hard-coded default app password.
7. Migrations run from a GitHub Action or locally with the owner connection string, never in the Vercel build.

## Full optimization (app, database, code, everything)

Rule: measure first, change one thing, measure again. Nothing here is started.

**Measure (baseline)**
- Production build: route sizes and the largest client bundles (`next build` output).
- Lighthouse on `/gym`, `/food`, `/todos` (phone profile): load time, JS size, layout shift.
- `EXPLAIN (ANALYZE, BUFFERS)` on each page's queries, with about 2 years of seeded data (extend `seed:dev`) so the numbers are real.
- Count queries and round trips per page; time a first request after the database slept.

**Database**
- Indexes: only unique constraints exist today (`user_id, date` on weight, metrics, todo stats). Add `(user_id, ...)` indexes where `EXPLAIN` shows a scan on a table that will grow: workout sets, meals, todos, todo completions. Skip the rest.
- `getWorkoutHistory`: bounded by date or paged; `getGymHistory` keeps its 370-day window; `getDailyMetricsHistory` and the weight analytics bounded or aggregated in SQL.
- Aggregate in SQL where the browser computes from thousands of rows, so less data leaves the database (Neon egress is 5 GB a month).
- Drop tables that are never read or written (Money, `api_tokens`, `claude_connections`, `push_subscriptions`) in one migration after the Azure variant is confirmed not to need them. Dropping is irreversible: take a dump first.
- Connection pool for serverless: `max` 1-2 per instance, a short `idleTimeoutMillis`, an `error` handler on the pool, Neon's pooled (`-pooler`) host. Neon suspends the compute and cuts idle connections, so a stale pooled connection must not crash a request. Needs a test against Neon.

**Server code**
- `/gym`: six awaits in a row become `Promise.all` where independent; check Food and Tasks for the same and for repeated reads of the same rows (N+1).
- Remove dead code with the Claude and push deletions, then unused exports and dependencies (`npm ls` plus a dead-code check). Dependencies are removed, never added, without asking.
- Cache only data that is not per user; per-user pages stay dynamic.

**Client**
- `three` is already imported lazily in `muscle-map.tsx`; check that the 5.6 MB `muscles.glb` loads only when the Muscle map is opened, then shrink it (mesh compression or lower detail, same look).
- Check the shared chart, modal and list-motion code for work done on every render; check long lists render only what is visible.
- Keep the service worker cache for `/_next/static` only (no personal data cached).

**Infrastructure and CI**
- Same region for Vercel functions and Neon.
- CI: cache dependencies, skip the container build and scans on docs-only changes (never skip security checks on code changes), keep the weekly scan schedule.
- Vercel Hobby runtime logs last 1 hour: log errors with a request id and no personal data, so a failure can be traced in time.

**Done when:** the first page after the database slept loads in about 2 seconds or less (target, to be confirmed with the baseline), a warm page in under 1 second, and `/gym` with 2 years of data stays flat in query time and payload.

## To verify by hand (unverified claims)

Confirmed on 2026-11-10 from the official pages the user pasted: Neon Free limits (above) and what happens at the limits (compute suspended until the next month, or writes failing at 1 GB, no data deleted); Vercel Hobby: 1,000,000 function invocations, 4 Active CPU-hours, 100 GB data transfer, 300 s maximum function time, 100 deployments a day, 1 hour of runtime logs, non-commercial use only, no overage charges (usage is paused for 30 days instead).

Still unverified:

1. **Neon allows `CREATE ROLE life_tracker_app`**, and our migrations (`GRANT ... TO life_tracker_app`) run.
2. **Vercel Hobby needs no card** (neither pasted page says), lets us pick the function region, and builds Next 16.4 with `output: "standalone"`.
3. **Neon rules for inactive free projects** (none found on the plans page), and that the Free terms do not change.

## Long-term checklist (free, unlimited time)

- Backup workflow: weekly, encrypted with `age`, restore tested once per quarter.
- Exit plan: the `Dockerfile` plus a dump run on any host (home server, Oracle Always Free). Keep it working; test a restore into a local Postgres.
- Usage check every few months: Neon CU-hours and storage, Vercel usage page.
- Rotate OAuth secret, `NEXTAUTH_SECRET` and the database password once a year.
- Keep Dependabot and CI running; the repo is private, so Actions minutes are the budget (2000 per month).
- Re-read the free-tier terms before relying on them; they can change at any time.
