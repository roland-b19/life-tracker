# Azure course project: how each requirement is implemented

Companion to `docs/requirements.md` (the checklist and grading rubric) and `docs/presentation.md` (the talk plan). This file says **where each requirement lives in the repo, how it is tested, and how far it has been seen working**.

## How to read the status

| Mark | Meaning |
|---|---|
| **Implemented** | The code, template or script exists in `main`. |
| **Tested offline** | Covered by a test or a build that needs no Azure account (Vitest, `az bicep build`, CI scans). |
| **Seen live** | Observed on a real Azure deployment. The only live run so far was the rehearsal of 2026-11-13 (resource group `life-tracker-stage`, region `italynorth`); it was torn down afterwards. Its notes sit on the closed branch `fix/azure-migrate` (PR #104), not on `main`. |
| **Not seen live** | Designed and tested offline, never observed on Azure. |

Nothing is deployed to Azure at the moment (`docs/STATUS.md`, "Deployed Azure resources").

## The application

Life Tracker is a personal tracker (tasks with reminders, wishlist, health with weight, water, steps and food, gym, shopping). One codebase has two hosts: Azure for the course (ephemeral) and Vercel + Neon for personal use (permanent, untouched by the Azure work). The app holds personal and health data, so security drives the design.

## Architecture

```
 Browser / PWA
      │ HTTPS, Entra sign-in
      ▼
 Container Apps environment (VNet-integrated)
   ├─ web app (Next.js) ───────► PostgreSQL Flexible Server (private, no public access)
   ├─ job enqueue (every minute) ─► Storage Queue "reminders" (private endpoint, no keys)
   └─ job send    (every minute) ◄─ same queue ──► web push service ──► the user's device
 Key Vault (private endpoint): database URL, auth secrets, VAPID private key
 ACR Premium (private endpoint): images pulled by digest
 Log Analytics: diagnostics, 3 alert rules → e-mail, 4 saved queries
```

Everything is declared in one Bicep template, `infra/main.bicep` (51 resource blocks, tagged `project`, `env`, `owner`).

## The eight requirements

### 1. At least one compute resource

- **What:** Azure Container Apps. A VNet-integrated managed environment runs the web app (`Microsoft.App/containerApps`, HTTPS-only ingress, liveness probe, scale limit) and Container Apps **jobs**: `enqueue`, `send`, and a one-off `migrate` job that applies the database migrations.
- **Where:** `infra/main.bicep` (`managedEnvironments`, `containerApps`, `jobs`); the worker code is in `worker/` (own Dockerfile, own dependencies).
- **Images:** built in CI, pushed to ACR and deployed **by digest** (the template refuses a mutable tag).
- **Status:** Implemented, tested offline (`tests/infra-contract.test.ts`, `tests/worker.test.ts`, `az bicep build` in CI). **Seen live** on 2026-11-13: the Bicep deployed, the web app and the enqueue and send jobs ran every minute.

### 2. At least one database or object storage

- **PostgreSQL Flexible Server** holds all application data (delegated subnet, private DNS, public access disabled). Schema and migrations: Drizzle, `drizzle/`.
- **Storage account with a Storage Queue** `reminders` (reminder messages).
- **Azure Container Registry (Premium)** holds the container images.
- **Status:** Implemented. **Seen live:** the server, the registry and the storage account deployed, migrations ran as a job, and public network access showed `Disabled`. **Not seen live:** a restore of the database from a backup (the Azure database restore is not tested; the weekly backup and its restore test belong to the personal deploy, not to Azure).

### 3. The application is secured (the database is not on the internet)

| Control | How |
|---|---|
| No public data plane | `publicNetworkAccess: Disabled` on PostgreSQL, Key Vault, ACR and the storage account. The registry and the vault answer 403 to the public internet. |
| Private networking | One VNet with subnets for Container Apps, PostgreSQL and private endpoints; private endpoints for ACR, Key Vault and the queue; four private DNS zones linked to the VNet. |
| No shared keys | Storage `allowSharedKeyAccess: false`, anonymous blobs off, ACR admin user off. Access goes through managed identities. |
| Secrets | Key Vault (RBAC, soft delete, purge protection). The app and the jobs read secrets through Key Vault references; no secret is in an image or in a connection string. |
| Least privilege | User-assigned managed identities with roles scoped to one resource each: AcrPull, Key Vault Secrets User, and Queue Data Message Sender / Processor on the one queue (no `listKeys`). |
| Transport | HTTPS-only ingress. |
| Startup guard | In production the app refuses to start when `NEXTAUTH_SECRET` or the OIDC settings are missing, and `AUTH_DEV=false` is enforced. |
| Supply chain (CI) | Lint, typecheck, tests, Trivy image scan, SBOM, gitleaks, dependency audit, Bicep build. |

- **Where:** `infra/main.bicep`, `docs/security/azure-hardening.md`, `docs/security-plan.md`, `docs/threat-model.md`; the rules are asserted by `tests/infra-contract.test.ts`.
- **Status:** Implemented, tested offline. **Seen live (2026-11-13):** Key Vault and ACR returned 403 from the public internet, the queue was blocked by network rules, shared-key access was off, public access was `Disabled` on PostgreSQL, Key Vault and ACR. **Not seen live:** the jobs reading Key Vault secrets over private DNS in a full run (end to end), TLS and diagnostics verification.

### 4. Authentication and authorization (mandatory)

- **Authentication:** Microsoft Entra ID sign-in through Auth.js (`AUTH_PROVIDER=azure-ad`) on Azure. The personal deploy uses GitHub sign-in with the same code (`src/auth.ts`). Every page and server action requires a session; there is no development bypass in production.
- **Authorization:** every row carries an owner, and every query and server action filters by the signed-in user. The identity key is the provider's immutable subject id, not the e-mail or the login name.
- **Where:** `src/auth.ts`, `src/server/auth.ts`, `app/api/auth/[...nextauth]/route.ts`.
- **Tests:** `tests/authorization.test.ts` (owner allowed, another user denied), `tests/actions-anonymous.test.ts` and `tests/pages-auth.test.ts` (anonymous denied), `tests/auth-guard.test.ts`, `tests/auth-github.test.ts`. A new endpoint ships such a test (rule in `AGENTS.md`).
- **Status:** Implemented, tested offline. **Not seen live:** the Entra callback on a deployed URL and the denial of a second Entra account (they need a second test account).

### 5. A message queue (ideal)

- **What:** **Azure Storage Queue** `reminders` carries web-push reminders between two jobs.
  - The `enqueue` job runs every minute, finds the reminders due in that minute and writes one **ids-only** message each.
  - The `send` job runs every minute, reads the queue, rechecks the owner and the task, sends the web push, deletes a subscription the push service reports gone (404, 410) and drops a message after 5 attempts.
  - The web app has no queue code.
- **Why scheduled and not event-driven:** in the GA Container Apps jobs API a scale rule has no managed-identity option, so an event-driven job would need a storage key, which the design forbids. Cost: about one minute of extra delay (`shortcut:` comment in `infra/main.bicep`, `docs/decisions.md` 2026-11-13).
- **Where:** `worker/enqueue.mjs`, `worker/send.mjs`, `worker/lib.mjs`, `worker/clients.mjs`; queue and private endpoint in `infra/main.bicep`.
- **Tests:** `tests/worker.test.ts` (message format, due-reminder selection, retries, gone subscriptions) and the queue rules in `tests/infra-contract.test.ts`.
- **Status:** Implemented, tested offline. **Seen live:** both jobs started every minute and the queue was reachable only through the private endpoint. **Not seen live:** a real reminder round trip (task with a reminder, queue message, notification on a phone).

### 6. Real functionality (not Hello World, not rocket science)

- **What:** Tasks (daily and one-off, streaks, reminders), Wishlist, Health (weight, water, steps, nutrition), Gym (plans, workouts, sets, progress, muscle map), Shopping. Dark, Apple-style UI, installable PWA.
- **Where:** `app/`, `src/`; the specification is `docs/spec.md`, the decisions are in `docs/decisions.md`.
- **Status:** Done. It has run in production on the personal deploy.
- **Left off on Azure:** the Claude Assistant (`NEXT_PUBLIC_CLAUDE_ENABLED=false`), by decision, to keep health data away from an AI provider.

### 7. Scripted deployments

| Script | Does |
|---|---|
| `scripts/azure-preflight.sh` | Read-only checks: `az`, `docker`, Bicep, a signed-in account. Creates nothing. |
| `scripts/azure-deploy.sh` | Resource group, `what-if` preview that the user approves, cost gate, image build and push, deploy by digest, migrations as a job. Multi-stage approvals. |
| `scripts/azure-teardown.sh` | Deletes the resource group, waits, and verifies it is gone. Idempotent. |
| `infra/main.bicep` | All resources and role assignments. |

- **Status:** Implemented, tested offline. **Seen live:** the deploy and teardown ran during the 2026-11-13 rehearsal. A migration-job fix found there (`scripts/azure-migrate.sh`) is on the closed branch `fix/azure-migrate` and is **not on `main`**; reopen it before the next live run.

### 8. Backend and database in the cloud, secured

- The Next.js backend (server actions and routes) runs in Container Apps and talks only to PostgreSQL over the VNet; the database has no public endpoint (requirements 1 to 3).
- A mobile client is optional: the web app is a PWA that installs on the iPhone Home Screen and receives web push.
- **Status:** Implemented, tested offline; same live coverage as requirements 1 to 3.

## Rubric items

### Observability (10%)

- **Log Analytics** workspace with **diagnostic settings** on PostgreSQL, Key Vault, ACR and the queue service; the Container Apps environment sends its console and system logs to the same workspace (`appLogsConfiguration`).
- **Action group** with e-mail to the budget contact.
- **Three metric alert rules:** web 5xx responses, replica restarts, queue backlog.
- **Four saved queries:** web errors, reminder runs and failures, queue activity, vault access.
- A **budget** resource (`Microsoft.Consumption/budgets`, default 25 USD) e-mails the same contact.
- A log-based alert on worker failures was dropped: Azure refused to create the scheduled query rule in this subscription during the rehearsal, so worker failures are read from the saved query instead (`docs/decisions.md` 2026-11-13).
- **Status:** Implemented, tested offline. **Not seen live:** that the alert rules fire, that the saved queries return rows, and that the action group's e-mail arrives. These need a live run.

### Deployment (10%)

Covered by requirement 7. Every iteration is deployed with the script, used, and deleted with the teardown script, as the course asks (the credit is limited).

### Cost

Estimates, not measurements: an ephemeral 1 to 2 hour run is about 0.20 to 0.35 USD; running 24/7 would be about 80 to 100 USD a month, which is why the plan is deploy, rehearse, present, tear down.

## Open before the presentation

1. Reopen `fix/azure-migrate` (the migration-job fix) and merge it.
2. A second live run: Entra sign-in, a second account denied another user's task, a real reminder on a phone, an alert fired, a saved query run, the budget and the action group e-mail.
3. Check that the rehearsal resource group `life-tracker-stage` no longer exists (`az group exists`), since it costs credit if it does. Not verified in this session.
4. After each live check, mark it in `docs/requirements.md`, `docs/presentation.md` and `docs/security/azure-hardening.md`.
