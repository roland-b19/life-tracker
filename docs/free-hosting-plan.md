# Free personal hosting plan (phase 2)

Status: **plan only, nothing implemented.** Decided 2026-11-10 (see `docs/decisions.md`). The Azure variant stays as it is; this is a second, env-selected way to run the same code.

## Target stack (all free tiers, no card where possible)

- Vercel Hobby (serverless Next.js, `*.vercel.app` domain), personal and non-commercial use only.
- Neon Free (Postgres: 0.5 GB per project, 100 CU-hours per month, compute suspends after 5 min idle, cannot be turned off).
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

## To verify by hand (unverified claims)

1. **Neon allows `CREATE ROLE life_tracker_app`**, and our migrations (`GRANT ... TO life_tracker_app`) run.
2. **Vercel Hobby needs no card**, lets us pick the function region, and builds Next 16.4 with `output: "standalone"`.
3. **Free limits still hold** (Neon CU-hours and storage, Vercel invocations and bandwidth, Neon behaviour for inactive free projects).

## Long-term checklist (free, unlimited time)

- Backup workflow: weekly, encrypted with `age`, restore tested once per quarter.
- Exit plan: the `Dockerfile` plus a dump run on any host (home server, Oracle Always Free). Keep it working; test a restore into a local Postgres.
- Usage check every few months: Neon CU-hours and storage, Vercel usage page.
- Rotate OAuth secret, `NEXTAUTH_SECRET` and the database password once a year.
- Keep Dependabot and CI running; the repo is private, so Actions minutes are the budget (2000 per month).
- Re-read the free-tier terms before relying on them; they can change at any time.
