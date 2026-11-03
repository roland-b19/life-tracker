# Iteration 2: Azure foundation and real login (IN PROGRESS)

The user approved starting iteration 2 on 2026-11-03. Nothing in this document
authorizes Azure resource creation without the separate deployment approval
after the cost estimate is shown. Do not start Gym, Food or another roadmap item.

## Goal

Run the existing weigh-in slice end to end on Azure with:

- a scripted, repeatable Bicep deployment;
- a private PostgreSQL Flexible Server;
- a Next.js container in Azure Container Apps;
- secrets held in Key Vault and accessed with managed identity;
- Microsoft Entra External ID for real sign-in;
- authorization still enforced by the existing `issuer` + `subject` ownership model;
- a one-command teardown that removes the resource group.

The result proves course requirements 1, 2, 3, 4, 7 and 8 without adding a
new product module.

## Scope

### In

- Azure CLI and Bicep pre-flight checks.
- Cost estimate and explicit deployment approval gate.
- Minimal production Docker image, running as non-root.
- Resource group, tags, VNet, private DNS and subnets.
- Azure Database for PostgreSQL Flexible Server with private access only,
  backups and a least-privilege application identity.
- Azure Container Registry with admin access disabled and managed-identity
  image pull.
- Azure Container Apps environment and app, scale-to-zero where compatible
  with the demo, HTTPS-only ingress and health probes.
- Key Vault with RBAC, soft delete and purge protection where the selected
  tier supports them.
- Log Analytics and diagnostic settings for the deployed resources.
- Entra External ID OIDC login, replacing the local credentials provider.
- Production configuration validation and migration job.
- Deploy and teardown scripts, smoke tests, authorization tests against the
  deployed app, and a private-database reachability check.
- Threat model, data inventory, ASVS matrix, Azure hardening checklist and
  README updates.

### Out

- Gym, Food features beyond the existing weigh-in slice, Money, To-do,
  notifications, queue, MCP connector and PWA install support.
- Azure resource creation before explicit approval.
- Portal-only changes, long-lived cloud credentials, database public access,
  Docker Compose deployment, or a second compute service.
- Entra tenant provisioning if Microsoft does not provide a supported
  scripted path; stop and ask instead of using undocumented click-ops.

## Decisions and gates

1. **Tenant gate:** verify whether the selected Entra External ID tenant and
   app registration can be provisioned and configured by supported CLI/API/IaC.
   If not, report the exact unsupported step and stop before tenant creation.
2. **Cost gate:** use the Azure Pricing Calculator with the actual region and
   SKU choices. Show monthly and hourly estimates for PostgreSQL, Container
   Apps, ACR, Key Vault, Log Analytics, public ingress and private endpoints.
   The user explicitly approves the estimate before deployment.
3. **Subscription gate:** confirm the subscription, region and remaining
   course credit without asking the user to paste credentials or IDs into chat.
4. **Network gate:** do not accept a fallback to a public PostgreSQL endpoint.
   If private networking cannot be deployed in the chosen region/SKU, stop.
5. **Capacity gate:** verify the selected PostgreSQL SKU has regional capacity
   before retrying. The first `belgiumcentral` attempt failed on B1ms capacity.
6. **Registry gate:** ACR Basic cannot disable public access; use Premium for a
   private endpoint or stop and obtain approval for a different design.
7. **Teardown gate:** test `scripts/azure-teardown.sh` in the same iteration
   and confirm the resource group is gone before calling the iteration done.

## Architecture

```
Internet
   |
HTTPS-only Container App ingress
   |
Container Apps Environment (VNet-integrated)
   |-- Next.js app, managed identity, ACR pull
   |-- Key Vault reference / secret retrieval
   |-- Log Analytics diagnostics
   |
Private DNS + private endpoint / delegated database subnet
   |
PostgreSQL Flexible Server (public access disabled)
```

The database remains the trust boundary for health data. The browser receives
only the Auth.js session cookie; database credentials and Entra client secrets
never reach it. The API derives the application user from the validated OIDC
identity and never accepts a `user_id` from the request.

## Runbook

### 0. Pre-flight and branch

- [ ] Read `AGENTS.md`, `docs/STATUS.md`, `docs/requirements.md`,
  `docs/decisions.md`, this plan and the Azure security reference.
- [ ] Create `feat/iteration-2` from `main`.
- [x] Verify `az`, `az bicep`, Docker, Node 24, npm, and the Bicep linter.
- [ ] Verify the logged-in account locally with `az account show`; do not print
  tokens, subscription IDs or tenant secrets.
- [x] Add offline `scripts/azure-preflight.sh` and guarded
  `scripts/azure-teardown.sh`; neither creates resources during validation.
- [x] Add a phase-2A deploy-script guard that validates inputs and Bicep but
  refuses deployment; the actual deployment command remains phase 2B.
- [ ] Confirm the target region and pricing estimate with the user.

**Check:** all tools work, no credentials are copied to files, and no Azure
resource exists yet. The failed first deployment was fully torn down; the
teardown script waits for deletion and verifies the project resource group is
absent. Pre-existing subscription resources are not project-owned.

### 1. Production configuration and container

- [x] Replace the development-only credentials provider with an OIDC provider
  selected by environment configuration; keep local development behind
  `AUTH_DEV=true` and the existing production guard.
- [x] Add a `Dockerfile` using a pinned Node 24 LTS base, multi-stage build,
  `output: "standalone"` and a non-root runtime user.
- [x] Add `.dockerignore`; verify `.env`, source maps if not needed, tests and
  secrets are absent from the image.
- [x] Add a container health endpoint that does not reveal configuration or
  database contents.
- [x] Keep migrations as an explicit owner-only release step, never at every
  request or every app startup.

**Check:** local production image starts with `AUTH_DEV=false`, passes the
existing tests, and an image inspection finds no secrets and no root process.
The production provider is configured by environment variables; phase 2A does
not contact Entra.

### 2. Bicep foundation

- [x] Add `infra/main.bicep` and small modules for network, database,
  registry, Container Apps, Key Vault, monitoring and role assignments.
- [ ] Require parameters for `location`, `environment`, `project`,
  `dbAdminPassword` only through a secure deployment mechanism, and image tag.
- [ ] Reject unsafe values: production cannot enable public database access,
  ACR admin credentials or development authentication.
- [ ] Tag every resource with `project=life-tracker`, `env=<name>` and
  `owner=<owner>`.
- [ ] Pin image/base versions and use least-cost SKUs after the cost gate.
- [x] Run `az bicep build` locally; run the linter and IaC scanner before
  phase 2B deployment.

**Check for phase 2A:** the template compiles offline and the deploy script
refuses to continue without both approval gates. In phase 2B, a what-if
deployment must show only intended resources and no public database endpoint.

### 3. Network and database

- [ ] Create a VNet with a delegated Container Apps subnet and a separate
  private-endpoint/database path as required by the selected Azure services.
- [ ] Create private DNS zones and links for PostgreSQL and Key Vault private
  access where used.
- [ ] Create PostgreSQL Flexible Server with public network access disabled,
  TLS required, encryption at rest on, backups enabled and deliberate
  retention.
- [ ] Use Entra/managed identity database authentication if supported by the
  selected PostgreSQL configuration; otherwise store the minimum migration
  credential in Key Vault and document rotation.
- [ ] Use a separate migration identity/credential from the runtime identity.
  The runtime can select/insert/update/delete only the application tables it
  needs and cannot change schema.

**Check:** the deployed app reaches PostgreSQL over the private path;
external network access to the database fails; migration succeeds twice; the
runtime identity cannot create tables.

### 4. Identity and real login

- [ ] Provision or configure the Entra External ID application through a
  supported scripted interface, with exact redirect URIs for the environment.
- [ ] Configure OIDC issuer, client ID, audience and allowed redirect host
  from Key Vault/runtime configuration; validate issuer, audience, signature,
  expiry, state, nonce and PKCE through Auth.js.
- [ ] Use `iss` + `sub` as the stable account key. Never auto-link by email.
- [ ] Keep session cookies `HttpOnly`, `Secure`, `SameSite=Lax` or stricter,
  `__Host-` scoped, with documented idle and absolute lifetimes.
- [ ] Remove the dev provider from the production build/configuration.
- [x] Add production configuration guard tests; add tests for anonymous denial,
  owner access and another account denial,
  invalid issuer/audience/expiry and callback failure.

**Phase 2A check:** real sign-in is configured by environment and missing
production OIDC settings fail closed. Phase 2B must prove that real sign-in
reaches the deployed app, logout clears the session,
and a second test identity cannot see or delete the first identity's weight.

### 5. Container Apps, secrets and monitoring

- [ ] Push the image to ACR using a versioned immutable tag.
- [ ] Disable ACR admin user; grant only the Container Apps managed identity
  pull permission.
- [ ] Configure HTTPS ingress, minimum TLS supported by the service, health
  probes, revision mode and a conservative scale limit.
- [x] Put `NEXTAUTH_SECRET`, OIDC settings and database runtime settings in
  Key Vault or managed configuration. Bicep accepts required secure parameters
  only through a secret-aware deployment mechanism; values must not appear in
  logs, image layers or GitHub output.
- [ ] Enable diagnostic settings to Log Analytics with a chosen retention;
  logs contain request metadata only, never weight values, tokens or cookies.
- [ ] Configure budget/cost alerts if permitted by the subscription.

**Check:** the app is reachable only over HTTPS, secrets are not visible in
the app settings or logs, and diagnostics show successful requests without
health data.

### 6. Deploy, smoke test and teardown

- [ ] Add `scripts/azure-deploy.sh`: validate prerequisites, run what-if,
  deploy Bicep, build/push the image, apply migrations through the private
  path, and print only the app URL and non-secret resource names.
- [ ] Add `scripts/azure-teardown.sh`: require an explicit environment name
  and confirmation, then delete only the tagged resource group.
- [ ] Add a smoke test for HTTPS, security headers, sign-in redirect, weight
  create/list/delete, duplicate date, invalid input and foreign object.
- [ ] Capture evidence: deployment output without secrets, resource list,
  private DB setting, migration result, test result and teardown result.
- [ ] Run teardown even if the iteration succeeds; update
  `docs/STATUS.md` so deployed resources are truthful.

**Check:** deploy -> work -> test -> teardown is repeatable and leaves no
running course resources.

### 7. Documentation and handoff

- [ ] Update `docs/threat-model.md` for Azure trust boundaries and T3/T5/T7.
- [ ] Update `docs/security/data-inventory.md` for Entra identity, Azure
  database, Key Vault, logs and backups.
- [x] Add `docs/security/azure-hardening.md` mapped to the cloud checklist;
  leave deployment evidence for phase 2B.
- [ ] Update `docs/security/asvs-matrix.md` with evidence for authentication,
  transport, secrets, database isolation and deployment.
- [ ] Update README deploy/teardown instructions without credentials.
- [ ] Run graphify, lint, typecheck, tests, build, npm audit, gitleaks, IaC
  scan and the `ponytail-review`/code-review checklist.
- [ ] Open a PR; merge only after CI and review pass.

## Required authorization test table

| Surface | Owner | Other account | Anonymous | Extra checks |
|---|---:|---:|---:|---|
| `GET /api/weight` | allowed | isolated | 401 | no-store |
| `POST /api/weight` | allowed | isolated | 401 | strict schema, duplicate date |
| `DELETE /api/weight/[id]` | allowed | 404 | 401 | same result for foreign/missing |
| OIDC callback/session | allowed after valid callback | denied | denied | issuer, audience, nonce, PKCE |
| health endpoint | no data | no data | allowed only if needed | no secrets/config leakage |

## Acceptance criteria

Iteration 2 is complete only when all are true:

1. The weigh-in slice works in Azure with real Entra login.
2. PostgreSQL has no public network access and the app uses the private path.
3. Runtime and migration privileges are separate and verified.
4. No development provider, secret, token, cookie or health value is exposed
   in the image, browser response, logs, repository or CI output.
5. Owner/other-user/anonymous authorization tests pass against the deployed
   routes.
6. CI is green, Bicep/IaC checks are green, and the deploy is scripted.
7. Teardown removes the resource group and `docs/STATUS.md` says no Azure
   resources are deployed.
8. The user has approved the next iteration before any later feature work.

## Risks and explicit stop conditions

- **Entra provisioning is not scriptable:** stop; do not use portal click-ops.
- **Private PostgreSQL is unavailable or too expensive:** stop and ask; do not
  make the database public as a shortcut.
- **A service requires a long-lived secret:** stop and document the limitation;
  do not commit it or put it in a workflow.
- **A scanner finds a real high/critical issue:** fix it before deployment.
- **A deployment partially fails:** run the teardown script, inspect the
  resource group, and do not retry blindly.
- **Cost differs materially from the approved estimate:** stop and ask again.
