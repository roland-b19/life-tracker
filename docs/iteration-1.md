# Iteration 1: local security spine (APPROVED 2026-11-02, NOT STARTED)

**Iteration 1 is the only thing to implement now.** Later iterations exist only as an estimate in `docs/roadmap.md`; do not start any of them. When iteration 1 is done, stop and wait: the user and the agent agree the next iteration together first.

Approved by the user with the recommended choices: the dependency list below, local sign-in option (a), weigh-in as the first slice. The user wants implementation to start later, not in the planning session. No branch, no code, no dependency installed yet.

Goal: a running local app that proves the parts the course grades and everything else builds on: login, per-user data isolation, a real database, automated authorization tests, CI. No Azure. Spec: `docs/spec.md`. Threat model: `docs/threat-model.md`.

## Scope
- **In:** Next.js skeleton, local Postgres, migrations, user table, one vertical slice (daily body-weight entry: add, list, delete), sign-in, authorization tests, security headers, CI, secret scan hook.
- **Out (later, see `docs/roadmap.md`):** Entra External ID, Azure resources and Bicep, Dockerfile for deploy, Gym, Money, To-do, queue and push, MCP connector, PWA manifest and service worker, any other weight or Food feature (notes, charts, steps).

Why weigh-in as the slice: it is Tier 1 (Food + weight), tiny, and it is health data, so it tests the strictest case of isolation and logging.

## Dependencies approved
| Dependency | Why | Alternative not chosen |
|---|---|---|
| next, react, react-dom, typescript, eslint (+ eslint-config-next, @types/*) | chosen stack | none |
| drizzle-orm, drizzle-kit, pg | SQL-first, light, standard SQL migrations, portable to phase 2 | Prisma (heavier engine, more magic) |
| zod | input validation at the trust boundary | hand-written checks |
| next-auth (Auth.js) | vetted OIDC; works with Entra later | own sessions (forbidden by the security rules) |
| vitest | tests | Jest |

Anything else needs the user's OK first (`AGENTS.md`). Tools on the user's machine: `pre-commit`, `gitleaks`. Docker and Node are present.

## Decisions made
1. Dependency list above: approved.
2. Local sign-in: dev-only credentials provider with a startup guard (option a). Not a local OIDC server, not a real Entra tenant.
3. First slice: weigh-in.

## Runbook for the implementing agent

Work top to bottom. One commit per sub-step or small group of them (Conventional Commits), all on branch `feat/iteration-1`. Tick the box in this file when the sub-step is done and its check passes, and commit the tick with the work. If a sub-step is wrong, fix this file instead of silently deviating. Stop and ask the user if you hit anything marked **ASK**.

### 0. Pre-flight
- [ ] 0.1 Read the "Read first" files in `AGENTS.md`, run `git log --oneline -15`, make sure `graphify-out/graph.json` exists (else `graphify update .`). Create branch `feat/iteration-1`.
- [ ] 0.2 Read, in full for the part you need: `secure-development` (`references/identity-access.md` sections 6 and 7, `input-api-files.md` for validation, headers and CSRF, `platform-data-ops.md` for logging and errors, `supply-chain-and-ci.md` section 9) and `apple-design` (`references/implementation-mapping.md`, `accessibility.md` checklist, `patterns-1.md` entering data).
- [ ] 0.3 Verify every approved package on npm before installing: it exists, current version, maintainers, publish date, repository. **No version is verified yet** (the earlier query was interrupted). **ASK** if `next-auth` supports the App Router only as a beta: the approval does not cover beta.
- [ ] 0.4 The dev machine runs Node 25 (not an LTS line). Choose an LTS for `.nvmrc`, `engines` and CI and check the app builds on it. **ASK** if it does not.
- Rules for the whole iteration: no `create-next-app` (it adds Tailwind and other unrequested files); `ignore-scripts=true` in `.npmrc`; commit `package-lock.json`; no Azure, Entra, deploy Dockerfile or other modules.

### 1. Skeleton
- [ ] 1.1 `.npmrc`, `.nvmrc`, `package.json` (scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:migrate`), strict `tsconfig.json`, install the approved dependencies.
- [ ] 1.2 ESLint config, `app/layout.tsx`, `app/page.tsx` (placeholder), "Run locally" section in `README.md`.
- Check: `npm run dev` serves the page; `lint`, `typecheck`, `build` pass.

### 2. Local database
- [ ] 2.1 `docker-compose.yml`: pinned Postgres image, port published as `127.0.0.1:5432:5432` only, healthcheck, credentials from `.env`.
- [ ] 2.2 `.env.example` with dev-only placeholder values and a comment saying so; confirm `.env` is git-ignored.
- [ ] 2.3 Init SQL script that creates two roles: an owner for migrations and a non-superuser `app` role for the request path (no `BYPASSRLS`, only the privileges it needs); also a second database for tests. Env vars `DATABASE_URL_MIGRATE` and `DATABASE_URL`.
- Check: `docker compose up -d` is healthy and both roles connect; the `app` role cannot create tables.

### 3. Schema and migrations
- [ ] 3.1 `src/db/schema.ts`: `users` (`id uuid` pk, `issuer`, `subject`, `created_at`, unique on `issuer` + `subject`; identify by issuer plus subject, ASVS 10.3.3, never by email).
- [ ] 3.2 `weight_entries` (`id uuid`, `user_id` FK to `users` with delete cascade, `date`, `kilograms numeric(5,2)` with a CHECK range, `created_at`, unique on `user_id` + `date`).
- [ ] 3.3 Generate the SQL migration with drizzle-kit and commit it; `db:migrate` runs as the owner role; grant the `app` role only the table privileges it needs.
- Check: migrating a fresh database works, and running it twice changes nothing.

### 4. Data access layer
- [ ] 4.1 `src/server/db.ts`: the connection (app role) and nothing else.
- [ ] 4.2 `src/server/weight.ts`: `list`, `create`, `remove`. Every function takes `userId` as a required argument and filters on it; lookup by (`id`, `user_id`), never by `id` alone. This is the only place that touches `weight_entries`.
- Check: a quick script or test creates entries for two users and each sees only their own.

### 5. Authentication
- [ ] 5.1 Auth.js config with a dev-only credentials provider that exists only when `AUTH_DEV=true`; on sign-in upsert the user as (`issuer` = `dev`, `subject` = the dev name).
- [ ] 5.2 Startup guard: module load throws if `AUTH_DEV=true` with `NODE_ENV=production`.
- [ ] 5.3 Session cookie `HttpOnly`, `Secure` in production, `SameSite=Lax` or stricter; write down idle and absolute lifetimes (ASVS 7.1.1) in `docs/security/asvs-matrix.md` (create it from the template in step 11 if it does not exist yet).
- [ ] 5.4 `src/server/auth.ts`: `requireUser()` returns the user id from the session or fails closed with 401. Endpoints never read a user id from the request.
- Check: a signed-in request resolves to the right user id; an anonymous one gets 401; the guard test (step 8) will lock the production refusal.

### 6. Weigh-in API
- [ ] 6.1 zod schemas that reject unknown keys (a client-sent `user_id` must fail, ASVS 8.2.3): `date` as `YYYY-MM-DD`, kilograms in a sane range with at most 2 decimals.
- [ ] 6.2 `GET` and `POST /api/weight`. Statuses: 401 anonymous, 400 invalid input, 409 duplicate date. `Cache-Control: no-store` on every response.
- [ ] 6.3 `DELETE /api/weight/[id]`: 404 for a foreign or missing id (same response for both).
- [ ] 6.4 State-changing routes require `Content-Type: application/json` and a same-origin `Origin` check (Auth.js protects only its own routes). Generic error bodies, detail only in the log.
- Check: calls with `curl` and a dev session behave as listed; error bodies leak nothing.

### 7. Weigh-in screen
- [ ] 7.1 Sign-in page (dev users) and a visible sign-out on every authenticated page.
- [ ] 7.2 Weigh-in page: date field defaulting to today, kilograms field with a visible label and `inputmode="decimal"`, list newest first, delete per row.
- [ ] 7.3 Styling: system font stack, `prefers-color-scheme`, 44 px targets, `rem` sizes, Reduce Motion honoured; errors next to the field and announced with `aria-live`. No delete confirmation dialog; note it with a `shortcut:` comment.
- [ ] 7.4 Run the accessibility checklist from `apple-design/references/accessibility.md` and fix what it finds.
- Check: add, list and delete work in a browser with keyboard only, in light and dark mode.

### 8. Authorization tests (Vitest, real Postgres, test database, users A and B seeded)
- [ ] 8.1 Vitest config and a helper that seeds A and B and calls a route with a chosen session (or none).
- [ ] 8.2 Per endpoint: owner allowed, other user denied (same as not found), anonymous denied.
- [ ] 8.3 Also: list returns only the caller's rows; create with another user's `user_id` in the body is rejected or ignored; invalid input rejected; duplicate date rejected.
- [ ] 8.4 `AUTH_DEV=true` with `NODE_ENV=production` refuses to start.
- [ ] 8.5 One test lists the route files under `app/api` and fails when an endpoint has no entry in the authorization test table, so a new endpoint cannot ship untested.
- Check: `npm test` passes on a clean database; deliberately removing the owner filter in `weight.ts` makes a test fail (then restore it).

### 9. Security baseline
- [ ] 9.1 Headers via `next.config` or middleware: CSP (no `unsafe-eval` in production; prefer a per-request nonce over `unsafe-inline`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors 'none'`, `Permissions-Policy`.
- [ ] 9.2 One small logger that records method, route pattern, status and a request id, never bodies, cookies or query values.
- [ ] 9.3 A test asserts the headers are present.
- Check: the page still works with the CSP in a production build (`npm run build && npm start`).

### 10. CI
- [ ] 10.1 `.github/workflows/ci.yml`: `permissions: contents: read`; jobs for lint, typecheck, tests with a Postgres service container; `npm ci` only.
- [ ] 10.2 `npm audit --audit-level=high` and a gitleaks scan. Third-party actions pinned to full commit SHAs looked up from the official repositories and verified, with the version in a comment.
- [ ] 10.3 `.github/dependabot.yml` for `npm` and `github-actions`.
- Check: CI is green on the PR; a deliberately failing test turns it red (then revert).

### 11. Docs, review, handoff
- [ ] 11.1 `docs/threat-model.md`: status of T1, T5, T6, T7, T15 and the new dependencies; `docs/security/data-inventory.md`: users, sessions and weight entries as stored now.
- [ ] 11.2 `docs/security/asvs-matrix.md` from the template, with the rows this iteration touches.
- [ ] 11.3 `docs/STATUS.md` and `docs/decisions.md` updated; `graphify update .`.
- [ ] 11.4 Run `ponytail-review` on the diff, then open the PR with the `code-review-guide` template. State in the PR what was not verified.

### Done when
All boxes ticked, CI green on the PR, `npm run dev` works from a fresh clone following the README, and the final message lists what you did not check. Then **stop**: do not start anything from `docs/roadmap.md`.

### Actions only the user can do (remind them, do not do them)
- `brew install pre-commit gitleaks`, then `pre-commit install`.
- In GitHub: protect `main` (PR required, CI as a required check).
- Approve the PR.

## Risks and what this iteration does not prove
- The dev sign-in is not the production login: authentication is only proven for real after Entra is added (roadmap, iteration 2).
- Entra External ID tenant creation may not be fully scriptable in Bicep; checked at the start of the Azure iteration.
- Tests run against a local Postgres, not the private Azure one; network isolation is verified in the Azure iteration.
