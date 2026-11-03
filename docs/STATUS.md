# Status

_Last updated: 2026-11-03 by Antigravity_

## Phase

Iteration 1 is complete and merged in `main`. Iteration 2A (local implementation
and hardened Azure contracts) is complete. Phase 2B preparation and infrastructure
remediation are complete: regional routing, Key Vault purge-protection conflict resolution,
official Azure RBAC role GUIDs, and non-interactive token-based ACR deployment have been
codified and validated. Target region `italynorth` with PostgreSQL Burstable (`Standard_B1ms` /
`Standard_B2s`) was approved by the user. Previous deployment attempts in Poland and Belgium
were torn down synchronously; deployment in `italynorth` is queued pending teardown completion.

## Verification status breakdown

- **Implemented locally:**
  - Pinned non-root container (`Dockerfile` with Node 24 LTS, `nextjs` user 1001).
  - Health endpoint (`/health`) and security headers.
  - OIDC authentication with production guard (`AUTH_DEV=false`).
  - Drizzle ORM schema, owner-scoped queries and restricted PostgreSQL roles.
  - Private-network Bicep template (`infra/main.bicep`) featuring:
    - PostgreSQL Flexible Server with public network access disabled and private DNS.
    - Configurable `postgresSku` parameter (default `Standard_B1ms`).
    - Key Vault with private endpoint, RBAC and purge protection.
    - ACR Premium with private endpoint and admin user disabled.
    - Container Apps with VNet integration, HTTPS-only ingress, scale-to-zero, and user-assigned managed identity.
    - Role assignments for ACR Pull and Key Vault Secrets User.
    - Log Analytics diagnostic settings on PostgreSQL, Key Vault, ACR, and Container Apps.
    - Consumption budget alert resource (`Microsoft.Consumption/budgets`).
  - Guarded scripts: `azure-preflight.sh`, `azure-deploy.sh` (runs what-if, validates parameters and immutable digest `sha256:...`, requires approvals), `azure-teardown.sh` (synchronous deletion with absence verification, targets only project resource group).
- **Verified via CI:**
  - Dependabot and Gitleaks secret scanning.
  - Syft/Anchore SPDX SBOM generation.
  - Trivy container scan for HIGH and CRITICAL vulnerabilities.
  - Bicep offline compilation and shell syntax validation (`bash -n`).
- **Verified via local tests:**
  - 14 Vitest unit, contract, and authorization tests passing.
  - Local PostgreSQL container tests passing with deterministic credentials.
  - Production container build and `/health` probe verified.
  - `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build` (production flags) passing.
  - `npm audit --audit-level=high --omit=optional` passing (0 high/critical).
- **Verified via Azure deployment:**
  - None. Azure 2B deployment has not been run in this phase.
- **Unverified (requires live Azure deployment):**
  - PostgreSQL private endpoint reachability from Container Apps.
  - Key Vault secret resolution at Container App startup.
  - Real Microsoft Entra External ID OIDC login flow (issuer, audience, PKCE, callback).
  - Absence of public access to PostgreSQL, Key Vault, and ACR from external networks.
  - Live backup retention and database restore.
  - Real-world diagnostic log generation without sensitive payload leakage.

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

1. Stop and obtain user decisions on:
   - Target Azure region (`belgiumcentral` with `Standard_B2s` vs `northeurope` / `francecentral` with `Standard_B1ms`).
   - Approval of revised cost estimate (ACR Premium + selected PostgreSQL SKU).
   - Entra External ID tenant details (tenant ID, client ID, client secret, issuer).
   - Approval to run Azure preflight, what-if, and live deployment.
2. Once approved: run preflight, what-if, live deployment, smoke tests, and immediate teardown.

## Open questions

See "Open" in `docs/decisions.md`.

## Deployed Azure resources

None for Life Tracker. The subscription's pre-existing
`NetworkWatcherRG/NetworkWatcher_belgiumcentral` is not owned by this project
and was intentionally left untouched.

## Session log (newest first)

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
