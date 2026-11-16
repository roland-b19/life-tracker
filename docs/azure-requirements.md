# Azure course project: how each requirement is implemented

Companion to `docs/requirements.md` (the checklist and grading rubric) and `docs/presentation.md` (the talk plan). This file says **where each requirement lives in the repo, how it is tested, and how far it has been seen working**.

## How to read the status

| Mark | Meaning |
|---|---|
| **Implemented** | The code, template or script exists in `main`. |
| **Tested offline** | Covered by a test or a build that needs no Azure account (Vitest, `az bicep build`, CI scans). |
| **Seen live** | Observed on a real Azure deployment. Three live runs so far: 2026-11-13 (rehearsal), 2026-11-16 (full app) and 2026-11-16 (final run, desktop only), both in resource group `life-tracker-stage`, region `italynorth`, both torn down afterwards. The 2026-11-13 notes and the migration fix are on `main` (PR #120); evidence of the 2026-11-16 runs: `docs/azure-evidence/2026-11-16-live-run.md` and `docs/azure-evidence/2026-11-16-final-run.md`. |
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

Everything is declared in one Bicep template, `infra/main.bicep` (about 54 resources when deployed, tagged `project`, `env`, `owner`).

## The eight requirements

### 1. At least one compute resource

- **What:** Azure Container Apps. A VNet-integrated managed environment runs the web app (`Microsoft.App/containerApps`, HTTPS-only ingress, liveness probe, scale limit) and Container Apps **jobs**: `enqueue`, `send`, and a one-off `migrate` job that applies the database migrations.
- **Where:** `infra/main.bicep` (`managedEnvironments`, `containerApps`, `jobs`); the worker code is in `worker/` (own Dockerfile, own dependencies).
- **Images:** built in CI, pushed to ACR and deployed **by digest** (the template refuses a mutable tag).
- **Status:** Implemented, tested offline (`tests/infra-contract.test.ts`, `tests/worker.test.ts`, `az bicep build` in CI). **Seen live** on 2026-11-13 and 2026-11-16: the Bicep deployed, the web app and the enqueue and send jobs ran every minute.

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
- **Status:** Implemented, tested offline. **Seen live (2026-11-13):** Key Vault and ACR returned 403 from the public internet, the queue was blocked by network rules, shared-key access was off, public access was `Disabled` on PostgreSQL, Key Vault and ACR. **Seen live (final run, 2026-11-16):** TLS (storage TLS1_2, PostgreSQL secure transport on), diagnostics on PostgreSQL, Key Vault, ACR and the queue, backup retention 7 days, secrets as `secretRef` in the app, and the jobs reading the VAPID secret through their identity (a desktop reminder arrived).

### 4. Authentication and authorization (mandatory)

- **Authentication:** Microsoft Entra ID sign-in through Auth.js (`AUTH_PROVIDER=azure-ad`) on Azure. The personal deploy uses GitHub sign-in with the same code (`src/auth.ts`). Every page and server action requires a session; there is no development bypass in production.
- **Authorization:** every row carries an owner, and every query and server action filters by the signed-in user. The identity key is the provider's immutable subject id, not the e-mail or the login name.
- **Where:** `src/auth.ts`, `src/server/auth.ts`, `app/api/auth/[...nextauth]/route.ts`.
- **Tests:** `tests/authorization.test.ts` (owner allowed, another user denied), `tests/actions-anonymous.test.ts` and `tests/pages-auth.test.ts` (anonymous denied), `tests/auth-guard.test.ts`, `tests/auth-github.test.ts`. A new endpoint ships such a test (rule in `AGENTS.md`).
- **Status:** Implemented, tested offline. **Seen live (2026-11-16):** the Entra sign-in on the deployed URL; anonymous visitors are redirected to the sign-in page. A live second-account denial is **skipped by the user's decision** (2026-11-13): isolation between users is covered by the automated authorization tests, and the ASVS V6.8.1 point (any account of the tenant can sign in) stays open.

### 5. A message queue (ideal)

- **What:** **Azure Storage Queue** `reminders` carries web-push reminders between two jobs.
  - The `enqueue` job runs every minute, finds the reminders due in that minute and writes one **ids-only** message each.
  - The `enqueue` job then runs `send.mjs` in the same execution, so a reminder set for 09:00 is pushed within seconds of 09:00. (Two separate jobs started at the same instant raced: `send` found an empty queue and the message waited a whole minute.)
  - The `send` job runs every minute as a retry consumer: it reads the queue, rechecks the owner and the task, sends the web push, deletes a subscription the push service reports gone (404, 410) and drops a message after 5 attempts.
  - The web app has no queue code.
- **Why scheduled and not event-driven:** in the GA Container Apps jobs API a scale rule has no managed-identity option, so an event-driven job would need a storage key, which the design forbids. Cost: a cold-started job, so delivery lands a few seconds after the minute starts (`shortcut:` comment in `infra/main.bicep`, `docs/decisions.md` 2026-11-13).
- **Where:** `worker/enqueue.mjs`, `worker/send.mjs`, `worker/lib.mjs`, `worker/clients.mjs`; queue and private endpoint in `infra/main.bicep`.
- **Tests:** `tests/worker.test.ts` (message format, due-reminder selection, retries, gone subscriptions) and the queue rules in `tests/infra-contract.test.ts`.
- **Status:** Implemented, tested offline. **Seen live:** both jobs started every minute and the queue was reachable only through the private endpoint. **Seen live (2026-11-16):** a real reminder round trip (task with a reminder, queue message, notification on a phone), after a fix so that it arrives within seconds of the minute (the enqueue job also runs the send step).

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

- **Status:** Implemented, tested offline. **Seen live:** the deploy and teardown ran during the 2026-11-13 rehearsal. A migration-job fix found there (`scripts/azure-migrate.sh`) is on `main` (PR #120). The 2026-11-16 run found that the migration job's own copy of the schema had drifted; the job now applies the Drizzle migrations (PR #121), proven live.

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
- **Status:** Implemented, tested offline. **Seen live (final run, 2026-11-16):** the `web-5xx` alert fired and its e-mail arrived (fired by stopping PostgreSQL for a few minutes: a stopped or restarted web revision gives no 5xx), the saved queries return rows, the budget exists.

### Deployment (10%)

Covered by requirement 7. Every iteration is deployed with the script, used, and deleted with the teardown script, as the course asks (the credit is limited).

### Cost

Estimates, not measurements: an ephemeral 1 to 2 hour run is about 0.20 to 0.35 USD; running 24/7 would be about 80 to 100 USD a month, which is why the plan is deploy, rehearse, present, tear down.

## Open before the presentation

All requirements and rubric lines were shown live on 2026-11-16 (`docs/azure-evidence/2026-11-16-final-run.md`). Left: one short deploy the day before or the day of the presentation (nothing stays running), and the demo script in `docs/presentation.md`. Not shown on Azure, by decision: a database restore (done on the personal deploy) and a second-account denial (covered by the authorization tests).
