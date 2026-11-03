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
- [x] 0.1 Read the "Read first" files in `AGENTS.md`, run `git log --oneline -15`, make sure `graphify-out/graph.json` exists (else `graphify update .`). Create branch `feat/iteration-1`.
- [x] 0.2 Read the security and Apple design references needed for authentication, validation, headers, accessibility and data entry.
- [x] 0.3 Verified the approved packages on npm; stable `next-auth` 4.24.15 supports the App Router route-handler pattern.
- [x] 0.4 Selected Node 24 LTS in `.nvmrc`, `engines` and CI; the production build passed with the local toolchain (Node 25 is installed locally).
- Rules for the whole iteration: no `create-next-app` (it adds Tailwind and other unrequested files); `ignore-scripts=true` in `.npmrc`; commit `package-lock.json`; no Azure, Entra, deploy Dockerfile or other modules.

### 1. Skeleton
- [x] 1.1 `.npmrc`, `.nvmrc`, `package.json`, strict `tsconfig.json`, lockfile and approved dependencies.
- [x] 1.2 ESLint config, app layout, placeholder entry point and local run instructions.
- Check: `npm run dev` serves the page; `lint`, `typecheck`, `build` pass.

### 2. Local database
- [x] 2.1 Pinned PostgreSQL Compose service, loopback-only port, healthcheck and environment credentials.
- [x] 2.2 Dev-only `.env.example`; `.env` remains ignored.
- [x] 2.3 Init script creates migration owner, restricted app role and test database; separate migration and request URLs are documented.
- Check: `docker compose up -d` is healthy and both roles connect; the `app` role cannot create tables.

### 3. Schema and migrations
- [x] 3.1 User schema keyed by issuer plus subject.
- [x] 3.2 Owner-scoped weight schema with cascade, numeric range check and unique user/date constraint.
- [x] 3.3 Generated idempotent migrations; migration owner and app table grants verified.
- Check: migrating a fresh database works, and running it twice changes nothing.

### 4. Data access layer
- [x] 4.1 App-role database connection.
- [x] 4.2 Owner-filtered list/create/remove data access layer.
- Check: a quick script or test creates entries for two users and each sees only their own.

### 5. Authentication
- [x] 5.1 Dev-only Auth.js credentials provider and issuer/subject upsert.
- [x] 5.2 Production startup guard.
- [x] 5.3 Secure session cookie settings and documented lifetimes.
- [x] 5.4 Server-side `requireUser()` and no request user id.
- Check: a signed-in request resolves to the right user id; an anonymous one gets 401; the guard test (step 8) will lock the production refusal.

### 6. Weigh-in API
- [x] 6.1 Strict Zod input validation and mass-assignment rejection.
- [x] 6.2 GET/POST weight API with required status mapping and no-store responses.
- [x] 6.3 Owner-scoped DELETE with indistinguishable foreign/missing responses.
- [x] 6.4 JSON content type, same-origin checks, generic errors and bounded logs.
- Check: calls with `curl` and a dev session behave as listed; error bodies leak nothing.

### 7. Weigh-in screen
- [x] 7.1 Dev sign-in and visible sign-out.
- [x] 7.2 Accessible weigh-in form and newest-first history with delete.
- [x] 7.3 System styling, appearance, target sizing, reduce motion and inline announcements.
- [x] 7.4 Accessibility checklist applied to the implemented screen.
- Check: add, list and delete work in a browser with keyboard only, in light and dark mode.

### 8. Authorization tests (Vitest, real Postgres, test database, users A and B seeded)
- [x] 8.1 Vitest config, real PostgreSQL setup and seeded users A/B.
- [x] 8.2 Owner, other-user and anonymous authorization tests.
- [x] 8.3 Isolation, mass assignment, invalid input and duplicate-date tests.
- [x] 8.4 Production refusal test.
- [x] 8.5 Route inventory test prevents untested API routes.
- Check: `npm test` passes on a clean database; deliberately removing the owner filter in `weight.ts` makes a test fail (then restore it).

### 9. Security baseline
- [x] 9.1 Security headers including CSP without `unsafe-eval`, HSTS, nosniff, referrer, frame and permissions policies.
- [x] 9.2 API errors log only bounded event names and status metadata; bodies and cookies are not logged.
- [x] 9.3 Header presence test.
- Check: the page still works with the CSP in a production build (`npm run build && npm start`).

### 10. CI
- [x] 10.1 CI with read-only permissions, PostgreSQL service, npm ci, lint, typecheck and tests.
- [x] 10.2 High-severity npm audit, gitleaks and SHA-pinned official actions.
- [x] 10.3 Dependabot for npm and GitHub Actions.
- Check: CI is green on the PR; a deliberately failing test turns it red (then revert).

### 11. Docs, review, handoff
- [x] 11.1 Threat model and data inventory updated for local users, sessions and weight entries.
- [x] 11.2 ASVS matrix created with iteration evidence and deferred SBOM item.
- [x] 11.3 Status, decisions and graph updated.
- [ ] 11.4 Review and PR remain the handoff step after this implementation commit.

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
