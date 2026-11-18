---
summary: How Life Tracker is built: folders, request flow, auth, data model, feature flags, push and PWA, deploy variants, backups, CI and tests.
covers: app/**, src/**, drizzle/**, drizzle.config.ts, next.config.ts, public/sw.js, worker/**, infra/**, Dockerfile, docker-compose.yml, docker/**, scripts/**, tests/**, playwright.config.ts, .github/workflows/**
last_verified: 2026-11-18
---

# Architecture

Next.js 16 (App Router) + TypeScript + Drizzle on Postgres, NextAuth v4, Vitest. A separate `worker/` (Node, Docker) sends push reminders on Azure. Node 24 (`.nvmrc`).

## Parts
- `app/<feature>/`: a server `page.tsx` plus a `*-client.tsx`. Features: wishlist, todos, gym (largest), health (route `/health`, the home: `/` redirects to it; `/food` redirects there for good for old bookmarks and the installed app), settings, signin. `app/components/` holds the shared UI (the Wishlist page is the reference).
- `src/lib/`: data access and pure rules. `src/lib/rules.ts` keeps plain rules apart from zod so client bundles stay small. `src/lib/validations/*` holds zod schemas.
- `src/actions/*.ts`: server actions, one file per feature (todos, wishlist, gym, food, food-chat, claude-connection, export).
- `src/server/`: auth (`requireUser()` for actions, `requirePageUser()` for pages and layouts) and db.
- `src/db/schema.ts`: Drizzle schema; migrations in `drizzle/0000..0031`.
- `worker/`: own `package.json` and Dockerfile; its deps stay out of the web app (tested).
- `infra/main.bicep`, `scripts/azure-*.sh`: the Azure course setup, deployed only on request.
- `scripts/backup-now.sh`, `scripts/import-personal.cjs`: manual owner tools with no npm script or caller (D-008). `scripts/import-personal.cjs` loads the owner's wishlist and tasks from the gitignored `.local/personal-data.json`; it writes SQL by hand, so it must follow every schema change to `wishlist_items`, `todos` and `item_categories`.

## How they connect
- **Read:** a page calls `requirePageUser()` (`src/server/auth.ts`, D-011), which redirects to `/signin` without a user and returns `{ id, name }`, then reads through `src/lib` (often `Promise.all`) and passes initial data to the client component.
- **Write:** the client calls a `"use server"` action. It starts with `requireUser()`, then `respond()` (`src/lib/validations/result.ts`, D-010) zod-parses the raw input, calls `src/lib` and answers `{ success: true, ... }` or `{ success: false, error }`; `src/lib` uses Drizzle through `src/server/db.ts`. Flagged actions call `assertClaudeEnabled()` or `assertPushEnabled()` first.
- **API routes:** `app/api/auth/[...nextauth]` and `app/api/health` (`{status:"ok"}`, no data; the Docker healthcheck and the Azure liveness probe call it, pinned by `tests/infra-contract.test.ts`). Every write, weight included, is a server action (D-007); Next itself rejects a cross-origin action call, so the app has no CSRF check of its own.
- **Layouts:** `RequireSession` is the `layout.tsx` of wishlist, todos, gym, health and settings, giving a real 307 to `/signin` before markup streams. Pages still call `requirePageUser()` themselves: a layout does not render again on client navigation, so it cannot be the only guard (Next's authentication guide).

## Auth and authorization
- `src/auth.ts`: JWT sessions. `AUTH_PROVIDER` is `azure-ad` (default, 4 h sessions) or `github` (the Vercel variant, 180 days, with `OWNER_ALLOWLIST` of GitHub numeric ids rechecked on every session read). `AUTH_DEV=true` swaps in a Credentials dev user and throws if set in production. A missing `NEXTAUTH_SECRET` in production throws at import.
- Users are unique on (issuer, subject). The local `users.id` is in `token.userId` and `session.user.id`. The session callback does no DB lookup.
- Authorization is per-user row ownership in code: every `src/lib` query filters by `user_id`, child tables carry `user_id` too. No RLS. The runtime role `life_tracker_app` is least-privilege, and every migration has explicit GRANTs: a new table needs a GRANT in its migration or the app cannot use it.
- Guards in tests: `tests/actions-anonymous.test.ts` globs every action file and asserts anonymous calls reject; `tests/pages-auth.test.ts` calls every page and layout as an anonymous visitor (redirect to `/signin`, no database access) and asserts that only `src/server/auth.ts` reads the session; `tests/authorization.test.ts` covers the weight actions and lists every API route file.

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
- PWA: `public/sw.js` has two caches: `life-tracker-v3` (static assets and the muscle model) and `life-tracker-pages-v2` (signed-in HTML, only same-day pages are served). Server actions and `/api` are never cached. `app/providers.tsx` triggers `router.refresh()` after writes. `app/components/page-cache.ts` clears the page cache on sign-out (its cache name must match `PAGES` in `public/sw.js`).
- `next.config.ts`: strict CSP and security headers (asserted in tests), `output: "standalone"`.

## Deploy variants
- **Vercel + Neon (live):** no `vercel.json`; `AUTH_PROVIDER=github`, `DB_POOL_MAX` 1-2, Claude and push off. Previews get no DB or auth secrets.
- **Azure (course demo):** `infra/main.bicep` (private networking, ACR by digest, Key Vault, Storage Queue, Container App plus worker jobs). `scripts/azure-deploy.sh` needs `DEPLOY_APPROVED=YES` and `COST_GATE_APPROVED=YES`. The Dockerfile is a 3-stage Alpine build with `public/` and `drizzle/` copied explicitly and a healthcheck on `/api/health`.
- **Local:** `docker-compose.yml` (Postgres 17.6 on 127.0.0.1:5432; `docker/postgres/init.sh` creates roles and the test database), `.env.example`, `npm run seed:dev`.
- **Backups:** `.github/workflows/backup.yml` runs weekly, dumps with the read-only role `life_tracker_backup` and encrypts with `age`; the private key stays with the owner. Do not weaken it. `scripts/backup-now.sh` is the manual twin: one plaintext `pg_dump` of the live database into the gitignored `.local/backups/`, run by the owner before a data-changing step (D-008).
- **CI:** `.github/workflows/ci.yml` runs one job with a Postgres 17.6 service: migrate, `npm run check` (lint, typecheck, tests, KB check), `npm run e2e` (Chromium, caches `~/.cache/ms-playwright` keyed on the Playwright version, installs the system libraries on every run, uploads the report on failure), image builds with Trivy and SBOM, Bicep build, `bash -n` on scripts, `npm audit` (production dependencies only, D-004), gitleaks. The Postgres version is pinned in four places that must match: `ci.yml`, `backup.yml`, `docker-compose.yml`, `scripts/backup-now.sh`.

## Tests
- Vitest, node environment, files run serially against one database. Outside CI the app role connects to `life_tracker_test`, with credentials read from `.env.example` (D-006); in CI one `life_tracker` database as `postgres`, from the job's env only. Tests need Postgres (about 15 files); the rest are pure.
- Playwright Test (D-005) in `tests/e2e/`, run by `npm run e2e` and excluded from Vitest: `playwright.config.ts` starts `next dev` on port 3100 with `AUTH_DEV=true` against the same test database, in two Chromium projects (`desktop`, `phone` at 375 px; `phone` runs only the `@a11y` scans, the flow runs on `desktop`), one worker, no retries; `@axe-core/playwright` scans each visited page; specs: Wishlist, the `/health` weight card, Tasks (`/todos`), Gym (`/gym`) and the shared categories card (Wishlist, Tasks Daily, Health shopping), with the shared sign-in, user cleanup and axe helper in `tests/e2e/helpers.ts`; each test's user is deleted afterwards. Details and gotchas: [conventions](conventions.md).
- Guards worth knowing: `query-count.test.ts` (page query and byte budgets with two years of data), `infra-contract.test.ts` (string checks on the Bicep and scripts), `actions-anonymous` and `pages-auth` (auto-cover new files).

## Repo layout
`app/` pages, `src/` logic, `drizzle/` migrations, `tests/`, `public/` (service worker, manifest, models), `worker/`, `infra/`, `scripts/`, `docker/`, `docs/` (KB and `licenses/`), `.github/`, `.claude/` (workflow).
