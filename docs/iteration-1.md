# Iteration 1: local security spine (APPROVED 2026-11-02, NOT STARTED)

Approved by the user with the recommended choices: the dependency list below, local sign-in option (a), weigh-in as the first slice. The user wants to start implementation later, not now. No branch, no code, no dependency installed yet.

Goal: a running local app that proves the parts the course grades and everything else builds on: login, per-user data isolation, a real database, automated authorization tests, CI. No Azure in this iteration. Spec: `docs/spec.md`. Threat model: `docs/threat-model.md`.

Done means: the app runs locally against a Postgres in Docker, the weigh-in slice works end to end for a signed-in user, every endpoint has the three authorization tests, CI is green, and the security checklist items below are ticked.

## Scope
- **In:** Next.js skeleton, local Postgres, migrations, user table, one vertical slice (daily body-weight entry: add, list, delete), sign-in, authorization tests, security headers, CI, secret scan hook.
- **Out (later iterations):** Entra External ID (iteration 2), Azure resources and Bicep (iteration 2), Dockerfile for deploy (iteration 2), Gym, Money, To-do, queue and push, MCP connector, PWA manifest and service worker.

Why weigh-in as the slice: it is Tier 1 (Food + weight), tiny, and it is health data, so it tests the strictest case of isolation and logging.

## Steps
1. **Branch** `feat/iteration-1`; work through small commits and one PR into `main`.
2. **Skeleton:** Next.js (App Router, TypeScript strict), npm, ESLint. One `README` section "run locally".
3. **Database:** `docker-compose.yml` with Postgres bound to `127.0.0.1` only; `.env.example` with a dev-only placeholder; real `.env` is git-ignored.
4. **Schema and migrations:** SQL migrations. Tables: `users` (id, identity subject, created_at) and `weight_entries` (id, user_id FK, date, kilograms, created_at). Unique per user and date. Every query filters by `user_id`.
5. **Authentication:** Auth.js (OIDC). Local sign-in is a dev-only provider that exists only when `AUTH_DEV=true`; the app refuses to start if that flag is set with `NODE_ENV=production`, and a test proves it. Iteration 2 swaps in Entra External ID, keyed by the same subject id.
6. **Authorization:** one `requireUser()` that returns the user id from the session and fails closed; no endpoint reads a user id from the request. Deny by default.
7. **Weigh-in slice:** `POST /api/weight`, `GET /api/weight`, `DELETE /api/weight/{id}`, validated with zod (kilograms range, date format), plus one screen: add form, list, delete. Follows the apple-design skill (system font, dark mode, labels, touch targets) and its accessibility checklist.
8. **Authorization tests (Vitest, against the real Postgres):** for each endpoint: owner allowed, other user denied (404 for a foreign id), anonymous denied (401). Plus: invalid input rejected; dev-auth refuses production.
9. **Security baseline:** security headers and a strict CSP in Next config; no health data in logs (log route, status, request id only); error responses generic.
10. **CI (GitHub Actions):** lint, typecheck, tests with a Postgres service, `npm audit`, gitleaks. Actions pinned to commit SHAs, `permissions: contents: read`.
11. **Local secret scan:** you run `brew install pre-commit gitleaks` and `pre-commit install` once.
12. **Docs and graph:** update `docs/STATUS.md`, `docs/decisions.md`, the threat model (status of rows T1, T5, T6, T7, T15), start `docs/security/asvs-matrix.md`, run `graphify update .`.

## Dependencies to approve (the working agreement requires your OK)
| Dependency | Why | Alternative |
|---|---|---|
| next, react, typescript, eslint | chosen stack | none |
| drizzle-orm, drizzle-kit, pg | SQL-first, light, standard SQL migrations, portable to phase 2 | Prisma (heavier engine, more magic) |
| zod | input validation at the trust boundary | hand-written checks (more code, more bugs) |
| next-auth (Auth.js) | vetted OIDC; works with Entra later | own sessions (not allowed by the security rules) |
| vitest | tests | Jest (heavier setup) |

Tools on your machine: `pre-commit`, `gitleaks` (step 11). No other install needed; Docker and Node are present.

## Decisions I need from you
1. Approve the dependency list above, or pick alternatives.
2. Local sign-in: **(a)** dev-only credentials provider with the startup guard (simplest, my recommendation for iteration 1), **(b)** a local OIDC server in Docker so the same OIDC code path runs everywhere (more setup, more realistic), **(c)** a real Entra External ID tenant from day one (needs your tenant now).
3. Weigh-in as the first slice, or another Tier-1 piece (a Gym session log is larger).

## Runbook for the implementing agent

Start here. Work step by step; one commit per step (Conventional Commits), all on `feat/iteration-1`. Tick a step in this file when it is done and green. If a step turns out wrong, fix this file, do not just deviate.

### Before step 1 (pre-flight)
- Read the "Read first" files in `AGENTS.md`, `git log --oneline -15`, then check `graphify-out/graph.json` exists (else `graphify update .`).
- Read, in full for the part you need: `secure-development` (`references/identity-access.md` sections 6 and 7, `references/input-api-files.md` for validation, headers and CSRF, `references/platform-data-ops.md` for logging and errors, `references/supply-chain-and-ci.md` section 9) and `apple-design` (`references/implementation-mapping.md`, `references/accessibility.md` checklist, `references/patterns-1.md` entering data).
- Verify every approved package on npm before installing (it exists, current version, maintainers, publish date, repository). The last attempt to query versions was interrupted, so **no version is verified yet**. Put `ignore-scripts=true` in `.npmrc`, commit `package-lock.json`, use `npm ci` in CI.
- Check `next-auth`: if the only version that supports the App Router is a beta (`@beta` tag), stop and ask the user before using it; it is not covered by the approval.
- The dev machine runs Node 25 (not an LTS line). Pick an LTS for `.nvmrc`, `engines` and CI, and check the app builds on it; tell the user if it does not.
- Do not scaffold with `create-next-app` (it adds Tailwind and other unrequested files); write the few files by hand.
- Out of scope, do not start: anything Azure, Entra, Dockerfile for deploy, other modules.

### Steps
1. **Skeleton.** `package.json` (scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:migrate`), strict `tsconfig.json`, ESLint config, `app/layout.tsx`, `app/page.tsx`, `.npmrc`, `.nvmrc`, a "Run locally" section in `README.md`. Done when `npm run dev` serves a page and `lint`, `typecheck`, `build` pass.
2. **Local database.** `docker-compose.yml` with a pinned Postgres image, port published as `127.0.0.1:5432:5432` only, healthcheck, credentials from `.env`. `.env.example` has dev-only placeholder values and a comment saying so; `.env` is git-ignored. An init SQL script creates two roles: an owner for migrations and a non-superuser `app` role for the request path (no `BYPASSRLS`, only the privileges it needs). Two URLs: `DATABASE_URL_MIGRATE`, `DATABASE_URL`. Also create a second database for tests. Done when `docker compose up -d` is healthy and both roles connect.
3. **Schema and migrations** (`src/db/schema.ts`, generated SQL committed). `users`: `id uuid` primary key, `issuer`, `subject`, `created_at`, unique on (`issuer`, `subject`) (identify by issuer plus subject, ASVS 10.3.3, never by email). `weight_entries`: `id uuid`, `user_id` FK to `users` with delete cascade, `date`, `kilograms numeric(5,2)` with a CHECK range, `created_at`, unique on (`user_id`, `date`). `db:migrate` runs as the owner role. Done when migrating a fresh database works twice (idempotent).
4. **Data access layer** (`src/server/weight.ts`). Every function takes `userId` as a required argument and filters on it; lookup by (`id`, `user_id`), never by `id` alone. No function can run without an owner. This is the single place that touches `weight_entries`.
5. **Authentication.** Auth.js with a dev-only credentials provider that exists only when `AUTH_DEV=true`; on sign-in, upsert the user as (`issuer` = `dev`, `subject` = the dev name). Module load throws if `AUTH_DEV=true` with `NODE_ENV=production`. Session cookie `HttpOnly`, `Secure` in production, `SameSite=Lax` or stricter; idle and absolute lifetimes written down. `requireUser()` (`src/server/auth.ts`) returns the user id from the session or fails closed with 401; endpoints never read a user id from the request. Sign-out reachable from every authenticated page.
6. **Weigh-in API.** `GET` and `POST /api/weight`, `DELETE /api/weight/[id]`. zod schemas that reject unknown keys (so a client-sent `user_id` fails or is ignored, ASVS 8.2.3): `date` as `YYYY-MM-DD`, kilograms in a sane range with at most 2 decimals. Statuses: 401 anonymous, 404 for a foreign or missing id (same response), 400 invalid input, 409 duplicate date. Generic error bodies, detail only in the log. State-changing routes require `Content-Type: application/json` and a same-origin `Origin` check (Auth.js protects only its own routes). `Cache-Control: no-store` on every response.
7. **Weigh-in screen** (one page plus a sign-in page). Date field defaulting to today, kilograms field with a visible label and `inputmode="decimal"`, list newest first, delete per row, errors next to the field and announced (`aria-live`). System font stack, `prefers-color-scheme`, 44 px touch targets, `rem` sizes, Reduce Motion honoured. No delete confirmation dialog (undoable-by-re-entry); note the shortcut with a `shortcut:` comment. Run the accessibility checklist before ticking this step.
8. **Authorization tests** (Vitest, real Postgres, test database, users A and B seeded). Per endpoint: owner allowed, other user denied (same as not found), anonymous denied. Also: list returns only the caller's rows, create with another user's `user_id` in the body is rejected or ignored, invalid input rejected, duplicate date rejected, and `AUTH_DEV` with production refuses to start. Add one test that lists the route files under `app/api` and fails when an endpoint has no entry in the authorization test table, so a new endpoint cannot ship untested.
9. **Security baseline.** In `next.config` or middleware: CSP (no `unsafe-eval` in production; prefer a per-request nonce over `unsafe-inline`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors 'none'`, `Permissions-Policy`. One small logger that records method, route pattern, status and a request id, never bodies, cookies or query values. A test asserts the headers are present.
10. **CI** (`.github/workflows/ci.yml`, `.github/dependabot.yml`). `permissions: contents: read`; jobs for lint, typecheck, tests (Postgres service container), `npm audit --audit-level=high`, and a gitleaks scan. Third-party actions pinned to full commit SHAs looked up from the official repositories and verified, with the version in a comment; `npm ci` only. Dependabot for `npm` and `github-actions`.
11. **Docs and handoff.** Update `docs/threat-model.md` (status of T1, T5, T6, T7, T15 and the new dependencies), `docs/security/data-inventory.md` (users, sessions, weight entries as stored now), start `docs/security/asvs-matrix.md` from the template, `docs/STATUS.md`, `docs/decisions.md`; run `graphify update .`; open the PR using the `code-review-guide` template and run `ponytail-review` on the diff first. State in the PR what was not verified.

### Done when
All steps ticked, CI green on the PR, `npm run dev` works from a fresh clone following the README, and the final message lists what you did not check.

### Actions only the user can do (remind them, do not do them)
- `brew install pre-commit gitleaks`, then `pre-commit install`.
- In GitHub: protect `main` (PR required, CI as a required check).
- Approve the PR.

## Risks and what this iteration does not prove
- The dev sign-in is not the production login: authentication is only proven for real after iteration 2.
- Entra External ID tenant creation may not be fully scriptable in Bicep; checked at the start of iteration 2.
- Tests run against a local Postgres, not the private Azure one; network isolation is verified in iteration 2.
