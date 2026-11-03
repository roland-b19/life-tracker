# Status

_Last updated: 2026-11-03 by Antigravity_

## Phase

Iterations 1, 2, and 3 are complete and merged in `main`. Iteration 4 (Food & Nutrition + Body Weight Complete)
is fully implemented and verified locally on branch `feat/iteration-4-food`.
All 31 Vitest tests pass, typecheck and linting pass with 0 warnings, and production build succeeds.

## Verification status breakdown

- **Implemented locally:**
  - Pinned non-root container (`Dockerfile` with Node 24 LTS, `nextjs` user 1001).
  - Health endpoint (`/health`) and security headers.
  - OIDC authentication with production guard (`AUTH_DEV=false`).
  - Drizzle ORM schema, owner-scoped queries and restricted PostgreSQL roles.
  - Gym module: 5-day Upper/Lower split, set logging (`reps x load`), anomaly flags `!!`, PR tracking, 5-week deload tracker.
  - Food & Nutrition module:
    - PostgreSQL schema (`nutrition_targets`, `daily_metrics`, `meals`, `recipes`, `recipe_ingredients`, `meal_plans`, `meal_plan_days`, `shopping_items`).
    - Migration `0004_left_chimera.sql` with least-privilege role permissions.
    - Owner-scoped DAL and Server Actions (`logMealAction`, `deleteMealAction`, `addWaterAction`, `updateStepsAction`, `updateTargetsAction`, `addShoppingItemAction`, `toggleShoppingItemAction`, `deleteShoppingItemAction`, `clearBoughtItemsAction`, `generateShoppingListAction`).
    - Enhanced body weight analytics (7-day rolling average and weekly rate of change).
    - Water tracker with quick tap counter (+250 ml, +500 ml) and daily steps logger.
    - Categorized shopping list with automatic aggregation from user recipes.
    - Apple HIG user interface at `/food` with progress cards for calories, protein, carbs, fat, water, and steps.
    - Segmented top navigation supporting **Gym Split**, **Food & Macros**, and **Weigh-ins**.

## Verification status breakdown

- **Implemented locally:**
  - Pinned non-root container (`Dockerfile` with Node 24 LTS, `nextjs` user 1001).
  - Health endpoint (`/health`) and security headers.
  - OIDC authentication with production guard (`AUTH_DEV=false`).
  - Drizzle ORM schema, owner-scoped queries and restricted PostgreSQL roles.
  - Gym module:
    - PostgreSQL schema (`exercises`, `workout_splits`, `workout_split_days`, `workout_split_day_exercises`, `workout_sessions`, `workout_sets`).
    - Seed data with default 5-day Upper/Lower split and preloaded exercises matching `gym-sample.md`.
    - Owner-scoped DAL and Server Actions (`logSetAction`, `startSessionAction`, `finishSessionAction`, `deleteSetAction`, `createCustomExerciseAction`, `getExerciseContextAction`).
    - Automatic `!!` anomaly detection when reps < target min reps, manual anomaly reason flagging.
    - In-workout context: previous session performance, PR tracking (excluding deload sessions), and progressive overload suggestion.
    - 5-week deload tracker cycle with reminder indicator.
    - Apple HIG user interface at `/gym` and segmented navigation between `/` (Weigh-ins) and `/gym`.
  - Private-network Bicep template (`infra/main.bicep`) featuring:
    - PostgreSQL Flexible Server with public network access disabled and private DNS.
    - Configurable `postgresSku` parameter (default `Standard_B1ms`).
    - Key Vault with private endpoint, RBAC and purge protection.
    - ACR Premium with private endpoint and admin user disabled.
    - Container Apps with VNet integration, HTTPS-only ingress, scale-to-zero, and user-assigned managed identity.
    - Role assignments for ACR Pull (`7f951dda-4ed3-4680-a7ca-43fe172d538d`) and Key Vault Secrets User (`4633458b-17de-408a-b874-0445c86b69e6`).
    - Explicit Bicep dependencies on `registryPrivateDnsGroup` and `vaultPrivateDnsGroup` to guarantee private DNS A-record registration prior to container image resolution.
    - Log Analytics diagnostic settings on PostgreSQL, Key Vault, ACR, and Container Apps.
    - Consumption budget alert resource (`Microsoft.Consumption/budgets`).
  - Guarded scripts: `azure-preflight.sh`, `azure-deploy.sh` (runs what-if, validates parameters and immutable digest `sha256:...`, builds and pushes amd64 image, automates database migrations via `Microsoft.App/jobs`), `azure-teardown.sh` (synchronous deletion with absence verification, targets only project resource group).
- **Verified via CI:**
  - Dependabot and Gitleaks secret scanning.
  - Syft/Anchore SPDX SBOM generation.
  - Trivy container scan for HIGH and CRITICAL vulnerabilities.
  - Bicep offline compilation and shell syntax validation (`bash -n`).
- **Verified via local tests:**
  - 14 Vitest unit, contract, and authorization tests passing.
  - Local PostgreSQL container tests passing with deterministic credentials.
  - Production container build (`linux/amd64`) and `/health` probe verified.
  - `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build` (production flags) passing.
  - `npm audit --audit-level=high --omit=optional` passing (0 high/critical).
- **Verified via live Azure deployment (`italynorth`):**
  - PostgreSQL Flexible Server reachability from inside VNet: verified (`current_database()`, `current_user`).
  - Key Vault secret resolution at Container App startup: verified (`database-url`, `nextauth-secret`, `auth-azure-client-secret`).
  - Container image pull from ACR over Private Endpoint: verified (digest `sha256:75d80d6f194a410bd0d8c1f1dbfc6445ff2937c519f4bc720a6989e7cd64cb0e`).
  - Live health check over HTTPS: `GET /health` -> `200 OK`, `{"status":"ok"}`.
  - Live authorization rejection: `GET /api/weight` -> `401 Unauthorized`.
  - CSRF / Origin protection: `POST /api/weight` -> `403 Forbidden`.
  - Microsoft Entra ID OIDC flow: `POST /api/auth/signin/azure-ad` -> `302 Redirect` to `https://login.microsoftonline.com/83cf6faf-7c1d-4271-bbdb-2030c5678923/oauth2/v2.0/authorize?client_id=75ae56c6-ccc7-4081-b308-1b391deaa1f0&scope=openid%20profile%20email&...`.
  - Security headers enforced: HSTS (`max-age=31536000; includeSubDomains`), CSP, X-Frame-Options (`DENY`), X-Content-Type-Options (`nosniff`), Referrer-Policy, Permissions-Policy.
  - Absence of public access to PostgreSQL, Key Vault, and ACR from external networks: verified (`publicNetworkAccess: "Disabled"` on all three).
  - Database schema bootstrap & migration: verified via `Microsoft.App/jobs` execution `lt-migrate-stage` (`status: Succeeded`).
- **Unverified (deferred to future iterations):**
  - Live backup retention window completion (7-day window) and point-in-time database restore.

## Regional audit and cost recalculation

- **Subscription:** Azure for Students (`rboldesco14@gmail.com`).
- **Region provisioning check (read-only):**
  - Restricted for subscription: `westeurope`, `germanywestcentral`, `eastus`, `eastus2`.
  - Permitted without restrictions: `belgiumcentral`, `northeurope`, `francecentral`, `swedencentral`, `polandcentral`, `italynorth`, `spaincentral`, `uksouth`.
  - In `belgiumcentral`, burstable SKUs are limited to `Standard_B1ms` (which previously had capacity exhaustion) and `Standard_B2s`.
  - In `northeurope` and `francecentral`, broader burstable SKUs (`Standard_B1ms`, `Standard_B2s`, `Standard_B2ms`, etc.) are available.
- **Cost recalculation:**
  - **ACR Premium:** ~$50.00 / month (~$0.07 / hour). Required because Azure only supports private endpoints on ACR Premium. For an ephemeral test run (1-2 hours), cost is ~$0.14.
  - **PostgreSQL Flexible Server B1ms:** ~$16.09 / month (~$0.022 / hour).
  - **PostgreSQL Flexible Server B2s (if B1ms capacity lacks):** ~$28.50 / month (~$0.039 / hour).
  - **Key Vault + Private Endpoint:** ~$7.30 / month (~$0.01 / hour).
  - **Container Apps (Consumption):** Scale-to-zero ($0 idle; first 180k vCPU-s free; <$0.05 per test run).
  - **Total 24/7 continuous monthly cost:** ~$80 - $90 (B1ms) or ~$92 - $102 (B2s).
  - **Total ephemeral test run cost (1-2 hours until teardown):** ~$0.20 - $0.35 total.
  - Well within course credit ($100), provided immediate teardown is enforced.

## Next

1. Open PR for `feat/iteration-4-food` into `main` and review with the user.
2. Plan Iteration 5 (Money module — personal and business expense tracking).

## Open questions

See "Open" in `docs/decisions.md`.

## Deployed Azure resources

None for Life Tracker. All resources deployed for Iteration 2 testing were
synchronously deleted via `scripts/azure-teardown.sh stage DELETE`. The subscription's
pre-existing `NetworkWatcherRG` is not owned by this project and was intentionally left untouched.

## Session log (newest first)

- 2026-11-04 — Iteration 4 implementation: Fully implemented Food & Nutrition and Body Weight Complete module on `feat/iteration-4-food`. Defined Drizzle schema for `nutrition_targets`, `daily_metrics`, `meals`, `recipes`, `recipe_ingredients`, `meal_plans`, `meal_plan_days`, and `shopping_items` with migration `0004_left_chimera.sql`. Implemented owner-scoped DAL and Server Actions, daily metrics (water tap counter and steps), 7-day weight rolling average and weekly rate of change, smart categorized shopping list populated from recipes, and Apple HIG interface at `/food`. 31 Vitest tests pass (including authorization, math calculations, multi-user isolation), 0 lint/typecheck errors, production build verified. No Azure resources created.

- 2026-11-04 — Iteration 3 merged and Iteration 4 planned: PR #13 squashed and merged into `main` with all CI checks passing; 0 open PRs. Created `docs/iteration-4.md` defining the complete Food & Nutrition module scope (daily macros with 3350 kcal / 170g protein / 300g carbs defaults, water tap counter 3L, steps 10k, 7-day weight moving average and rate of change, weekly meal plan, and auto-generated categorized shopping list). Local-first execution on branch `feat/iteration-4-food`.

- 2026-11-03 — Iteration 3 implementation: Fully implemented the Gym module locally on `feat/iteration-3-gym`. Defined Drizzle schema for `exercises`, `workout_splits`, `workout_split_days`, `workout_split_day_exercises`, `workout_sessions`, and `workout_sets` with migration `0003_curved_lady_bullseye.sql`. Implemented seed data for the 5-day Upper/Lower split, owner-scoped DAL and Server Actions, automatic `!!` anomaly marker detection, in-workout performance context, PR calculation (excluding deload sessions), 5-week deload cycle tracker, and Apple HIG interface at `/gym`. 23 Vitest tests pass (including multi-user isolation and authorization), 0 lint/typecheck errors, production build verified. No Azure resources created.

- 2026-11-03 — Iteration 2 live deployment, verification, and teardown:
  Deployed stage environment in approved region `italynorth`.
  Resolved Bicep dependency ordering by making `containerApp` explicitly depend on
  `registryPrivateDnsGroup`, `vaultPrivateDnsGroup`, and Key Vault secrets, eliminating
  transient private DNS resolution errors (`lookup lifetrackerstageitacr.azurecr.io: no such host`).
  Automated PostgreSQL schema bootstrap and table migration via `Microsoft.App/jobs`
  (`lt-migrate-stage`), executing least-privilege role creation (`life_tracker_app`) and
  Drizzle schema creation within the private VNet.
  Verified live HTTPS endpoint (`/health` -> 200), authorization rejection (`/api/weight` -> 401),
  CSRF protection (`POST /api/weight` -> 403), security headers (HSTS, CSP, X-Frame-Options,
  Permissions-Policy), and live Microsoft Entra ID OIDC redirect (`/api/auth/signin/azure-ad` -> 302
  to `login.microsoftonline.com`). Verified network isolation (`publicNetworkAccess: Disabled` on
  PostgreSQL, Key Vault, and ACR). Completed full synchronous teardown; 0 project resources remain.
  All 14 unit and contract tests passing.

- 2026-11-03 — Phase 2B infrastructure root cause fixes and regional migration:
  evaluated `polandcentral` (Burstable unsupported on subscription policy) and
  `belgiumcentral` (Burstable capacity exhausted in data center). Cleaned up via
  synchronous teardowns. Corrected Key Vault Secrets User role definition GUID to
  `4633458b-17de-408a-b874-0445c86b69e6` (verified directly against Azure CLI role definitions).
  Generated unique deterministic Key Vault resource names (`${suffix}kv${uniqueString(rg.id)}`)
  to avoid soft-delete purge-protection retention conflicts. Added regional `registryName`
  and token-based non-interactive ACR authentication (`az acr login --expose-token`) to
  resolve global Traffic Manager DNS cache issues. User approved `italynorth` as the
  next target region. 14 local tests pass.

- 2026-11-03 — Azure 2B preparation and audit: verified read-only regional
  provisioning restrictions (`westeurope` restricted; `belgiumcentral`,
  `northeurope`, `francecentral` permitted). Recalculated ACR Premium and
  PostgreSQL B1ms/B2s costs. Enhanced `infra/main.bicep` with diagnostic settings
  for PostgreSQL, Key Vault, and ACR, consumption budget alert resource, and
  configurable `postgresSku`. Updated `scripts/azure-deploy.sh` to require what-if
  preview and multi-stage approval. 14 local tests pass. No Azure resources created.

- 2026-11-03 — Security audit fix: mutable production image tags were removed
  from the Bicep contract and deploy validation; CI SBOM/container scanning and
  deterministic test setup were added. No Azure resources created.
- 2026-11-03 — Merged Dependabot PRs #2–#4 after successful CI and verified
  post-merge `main` CI. PR #5 uses the official TypeScript 7.0/6.0
  compatibility aliases so `typescript-eslint` keeps its supported TypeScript
  6 API while `tsc` runs TypeScript 7; lint, typecheck, migration, tests,
  production build, container build, lockfile install and audit checks passed
  locally. No Azure resources created.
- 2026-11-03 — Reconciled the merged Iteration 2 plan from PR #7 with the merged local implementation in PR #8; retained the plan as the phase 2B runbook and corrected stale approval wording. No Azure resources created.
- 2026-11-03 — PR #1 CI secret scan fixed with the GitHub token, pull-request read permission and full history required for pull-request scans; local lint, typecheck, migration and authorization tests passed.
- 2026-11-03 — Iteration 1 implemented locally: security spine, weigh-in slice, PostgreSQL, tests and CI. Validation passed; no Azure resources created.
- 2026-11-03 — Detailed plan for iteration 2 added in `docs/iteration-2.md` and approved; its local 2A phase was then completed. No Azure resources created.
- 2026-11-03 — Iteration 2A completed locally: OIDC production configuration, private-network Bicep template, guarded Azure scripts and CI validation added. Lint, typecheck, production build, Bicep compile and 8 tests pass. Phase 2B paused; no Azure resources created.
- 2026-11-03 — Phase 2B deployment preview passed in `belgiumcentral`, but the approved deployment failed before completion: PostgreSQL B1ms had no regional capacity and ACR Basic rejected disabled public access. Partial resources were fully torn down; no Azure resources remain. Retry requires a cost/SKU decision.
- 2026-11-03 — Verified the Life Tracker resource group and resources are absent. `NetworkWatcherRG/NetworkWatcher_belgiumcentral` is a pre-existing subscription resource and is excluded from project teardown. Teardown script strengthened to wait for deletion and verify absence.
- 2026-11-03 — PR #8 HIGH findings fixed locally: private ACR SKU and Key Vault-backed Container App runtime contract. No Azure resources created; the revised Premium cost still requires explicit approval. Teardown script strengthened to wait for deletion and verify absence.
- 2026-11-03 — Final PR #8 review found that a system-assigned identity could race its RBAC grants during initial Container App creation. Replaced it with a pre-created user-assigned identity and made app creation wait for the ACR and Key Vault role assignments. No Azure resources created.
- 2026-11-02 — Iteration 1 plan written and approved (`docs/iteration-1.md`); the user deferred implementation. No application code yet.
- 2026-11-02 — Spec approved; threat model v1, data inventory and risk register written (`docs/threat-model.md`, `docs/security/`). No application code yet.
- 2026-11-02 — Planning Q&A for all modules, tiers, stack direction (TypeScript, Entra External ID, queue for push). Spec drafted. No application code yet.
- 2026-11-02 — Added code-review-guide, audited the 3 project skills, created project-setup, cleanup. No application code yet.
- 2026-11-02 — Initial setup (Claude Code). No application code yet.
