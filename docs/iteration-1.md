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

## Risks and what this iteration does not prove
- The dev sign-in is not the production login: authentication is only proven for real after iteration 2.
- Entra External ID tenant creation may not be fully scriptable in Bicep; checked at the start of iteration 2.
- Tests run against a local Postgres, not the private Azure one; network isolation is verified in iteration 2.
