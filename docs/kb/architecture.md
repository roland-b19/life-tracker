---
summary: How Life Tracker is built: folders, request flow, auth, data model, feature flags, push and PWA, deploy variants, backups, CI and tests.
covers: app/**, src/**, drizzle/**, drizzle.config.ts, next.config.ts, public/sw.js, worker/**, infra/**, Dockerfile, docker-compose.yml, docker/**, scripts/**, tests/**, .github/workflows/**
last_verified: 2026-11-18
---

# Architecture

Next.js 16 (App Router) + TypeScript + Drizzle on Postgres, NextAuth v4, Vitest. A separate `worker/` (Node, Docker) sends push reminders on Azure. Node 24 (`.nvmrc`).

## Parts
- `app/<feature>/`: a server `page.tsx` plus a `*-client.tsx`. Features: wishlist, todos, gym (largest), food (the home, `/` redirects to `/food`), settings, signin. `app/components/` holds the shared UI (the Wishlist page is the reference).
- `src/lib/`: data access and pure rules. `src/lib/rules.ts` keeps plain rules apart from zod so client bundles stay small. `src/lib/validations/*` holds zod schemas.
- `src/app/actions/*.ts`: server actions, one file per feature (todos, wishlist, gym, food, food-chat, claude-connection, export).
- `src/server/`: auth, db, logger, API helpers, `weight.ts`.
- `src/db/schema.ts`: Drizzle schema; migrations in `drizzle/0000..0031`.
- `worker/`: own `package.json` and Dockerfile; its deps stay out of the web app (tested).
- `infra/main.bicep`, `scripts/azure-*.sh`: the Azure course setup, deployed only on request.

## How they connect
- **Read:** a page calls `getServerSession(authOptions)`, redirects to `/signin` without a user, then reads through `src/lib` (often `Promise.all`) and passes initial data to the client component.
- **Write:** the client calls a `"use server"` action. It starts with `requireUser()`, zod-parses the raw input, then calls `src/lib`, which uses Drizzle through `src/server/db.ts`. Flagged actions call `assertClaudeEnabled()` or `assertPushEnabled()` first.
- **Only API routes:** `app/api/weight` (+ `[id]`) and `app/api/auth/[...nextauth]`. Weight checks JSON content type, then `isSameOrigin` (compares Origin with the forwarded host, not `request.url`), then `requireUser`, then zod, and returns a generic error body (`src/server/api-errors.ts`). See [status](status.md) for why weight is the odd one out.
- **Layouts:** `RequireSession` is the `layout.tsx` of wishlist, todos, gym, food and settings, giving a real 307 to `/signin` before markup streams. Pages still check the session themselves.

## Auth and authorization
- `src/auth.ts`: JWT sessions. `AUTH_PROVIDER` is `azure-ad` (default, 4 h sessions) or `github` (the Vercel variant, 180 days, with `OWNER_ALLOWLIST` of GitHub numeric ids rechecked on every session read). `AUTH_DEV=true` swaps in a Credentials dev user and throws if set in production. A missing `NEXTAUTH_SECRET` in production throws at import.
- Users are unique on (issuer, subject). The local `users.id` is in `token.userId` and `session.user.id`. The session callback does no DB lookup.
- Authorization is per-user row ownership in code: every `src/lib` query filters by `user_id`, child tables carry `user_id` too. No RLS. The runtime role `life_tracker_app` is least-privilege, and every migration has explicit GRANTs: a new table needs a GRANT in its migration or the app cannot use it.
- Guards in tests: `tests/actions-anonymous.test.ts` globs every action file and asserts anonymous calls reject; `tests/pages-auth.test.ts` asserts every page checks the session; `tests/authorization.test.ts` covers the weight routes.

## Data model
- All ids are uuid, timestamps are `timestamptz`, day columns are plain `date`. Everything cascades from `users`.
- Health: `weight_entries` (unique user+date), `daily_metrics`, `nutrition_targets`, `meals`, `recipes`, `recipe_ingredients`, `shopping_items`, `shopping_categories`, `shopping_units`. Cross-feature: `item_categories` (scope wishlist, personal or business).
- Gym: `exercises` (user NULL = shared default), `workout_splits`, `workout_split_days`, `workout_split_day_exercises`, `workout_sessions`, `workout_sets`, `deload_weeks`. A partial unique index allows one open workout per user; `lockUser()` in `src/lib/gym-seed.ts` serialises writes with an advisory lock.
- Other: `todos`, `wishlist_items`, `push_subscriptions`, `claude_connections` (AES-GCM token).
- Hard deletes only. Undo goes through `restore*` actions that re-insert under the old id. Exceptions: `shopping_items.cleared_at` and `meals.forgotten`.
- Migrations: `npm run db:migrate` (drizzle-kit, reads `DATABASE_URL_MIGRATE`, falls back to `DATABASE_URL`). On the live deploy the owner runs them from their Mac before merging code that needs them; they stay additive.
- DB client: `pg` Pool through Drizzle. `DB_POOL_MAX` defaults to 5 (set 1-2 on Vercel), `DB_IDLE_TIMEOUT_MS` defaults to 10 s because Neon suspends idle computes.

## Flags, Claude, push, PWA
- `src/lib/features.ts`: `NEXT_PUBLIC_CLAUDE_ENABLED` and `NEXT_PUBLIC_PUSH_ENABLED`, off unless `"true"`, inlined at build time (Dockerfile ARGs). Claude is on only for a local run with the `claude` CLI; push is on for Azure only.
- Claude chat: `src/lib/claude-cli.ts` spawns the `claude` binary headless (no tools, empty temp dir, 90 s timeout, 2 concurrent children, 1 MB output cap, stdout never logged). `food-ai-chat.ts` validates the JSON reply and logs meals.
- Token: the user pastes `claude setup-token` output in Settings; AES-256-GCM with `CLAUDE_TOKEN_KEY`, never returned to the client.
- Push: the browser subscribes in Settings; two Azure jobs run every minute from `worker/`: `enqueue.mjs` puts `{todoId,userId}` (ids only) on a Storage Queue, `send.mjs` re-reads the todo, checks the owner and sends web-push, dropping dead subscriptions.
- PWA: `public/sw.js` has two caches: `life-tracker-v3` (static assets and the muscle model) and `life-tracker-pages-v1` (signed-in HTML, only same-day pages are served). Server actions and `/api` are never cached. `app/providers.tsx` triggers `router.refresh()` after writes. `app/components/page-cache.ts` clears the page cache on sign-out (its cache name must match `PAGES` in `public/sw.js`).
- `next.config.ts`: strict CSP and security headers (asserted in tests), `output: "standalone"`.

## Deploy variants
- **Vercel + Neon (live):** no `vercel.json`; `AUTH_PROVIDER=github`, `DB_POOL_MAX` 1-2, Claude and push off. Previews get no DB or auth secrets.
- **Azure (course demo):** `infra/main.bicep` (private networking, ACR by digest, Key Vault, Storage Queue, Container App plus worker jobs). `scripts/azure-deploy.sh` needs `DEPLOY_APPROVED=YES` and `COST_GATE_APPROVED=YES`. The Dockerfile is a 3-stage Alpine build with `public/` and `drizzle/` copied explicitly and a `/health` healthcheck.
- **Local:** `docker-compose.yml` (Postgres 17.6 on 127.0.0.1:5432; `docker/postgres/init.sh` creates roles and the test database), `.env.example`, `npm run seed:dev`.
- **Backups:** `.github/workflows/backup.yml` runs weekly, dumps with the read-only role `life_tracker_backup` and encrypts with `age`; the private key stays with the owner. Do not weaken it.
- **CI:** `.github/workflows/ci.yml` runs one job with a Postgres 17.6 service: migrate, `npm run check` (lint, typecheck, tests, KB check), image builds with Trivy and SBOM, Bicep build, `bash -n` on scripts, `npm audit` (production dependencies only, D-004), gitleaks. The Postgres version is pinned in four places that must match: `ci.yml`, `backup.yml`, `docker-compose.yml`, `scripts/backup-now.sh`.

## Tests
- Vitest, node environment, files run serially against one database. Outside CI the app role connects to `life_tracker_test`; in CI one `life_tracker` database as `postgres`. Tests need Postgres (about 15 files); the rest are pure.
- Guards worth knowing: `query-count.test.ts` (page query and byte budgets with two years of data), `infra-contract.test.ts` (string checks on the Bicep and scripts), `actions-anonymous` and `pages-auth` (auto-cover new files).

## Repo layout
`app/` pages, `src/` logic, `drizzle/` migrations, `tests/`, `public/` (service worker, manifest, models), `worker/`, `infra/`, `scripts/`, `docker/`, `docs/` (KB and `licenses/`), `.github/`, `.claude/` (workflow).
