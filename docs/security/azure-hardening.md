# Azure hardening checklist

This is the local design checklist for iteration 2A. No item here proves that
an Azure resource exists or is configured; phase 2B must attach deployment
evidence before marking an item complete. A Bicep compile or what-if is not
runtime evidence.

## Phase 2A: designed and locally validated

- [x] Resources have `project`, `env` and `owner` tags in `infra/main.bicep`.
- [x] PostgreSQL uses a delegated subnet, private DNS and public access disabled.
- [x] Key Vault uses RBAC, soft delete, purge protection and a private endpoint.
- [x] ACR uses the Premium SKU required for private endpoints, disables admin
  credentials and uses a private endpoint.
- [x] Container Apps uses a VNet-integrated environment and user-assigned managed identity
  for ACR pull.
- [x] Container Apps receives required database and authentication secrets via
  Key Vault references; its user-assigned identity has only the Key Vault Secrets User
  role at the vault scope, and `AUTH_DEV=false` is enforced.
- [x] The application rejects production startup when `NEXTAUTH_SECRET` or
  required OIDC settings are missing.
- [x] HTTPS-only ingress, a liveness probe and a scale limit are declared.
- [x] The Bicep template compiles with `az bicep build` and requires an
  immutable image digest.
- [x] Diagnostic settings to Log Analytics are declared for PostgreSQL, Key Vault,
  ACR, and Container Apps.
- [x] Budget alert resource is declared in Bicep (`Microsoft.Consumption/budgets`).
- [x] Deploy and teardown scripts are versioned; `azure-deploy.sh` requires what-if
  preview and multi-stage approvals; teardown is idempotent, waits for deletion
  and verifies the resource group is absent.

- [x] Reminder queue: storage account with public network access, shared-key access
  and anonymous blobs disabled; private endpoint for the `queue` group with private
  DNS; worker identity with roles scoped to the one queue (no `listKeys`); VAPID
  private key in Key Vault. Checked by `tests/infra-contract.test.ts`.
- [x] Observability: action group with e-mail, alert rules for web 5xx, replica
  restarts, and queue backlog, four saved Log Analytics queries.
- [x] CI builds, scans (Trivy) and audits the worker image and its own dependencies.

## Phase 2B: evidence required after explicit approval

- [x] `az deployment group what-if` reviewed against the final deployment (2026-11-16: 54 to create, 0 modify, 0 delete; `docs/azure-evidence/2026-11-16-final-run.md`).
- [x] No public database, Key Vault or registry endpoint is reachable (live 2026-11-13: `publicNetworkAccess` Disabled on all three; Key Vault `Forbidden` and ACR 403 from outside; queue blocked by network rules).
- [x] Runtime identity pulls from ACR without admin credentials (live 2026-11-13: app, enqueue, send and migration jobs run from ACR with managed identities; admin user disabled).
- [x] Secrets are injected from Key Vault (live 2026-11-16: the app's DATABASE_URL, NEXTAUTH_SECRET and AUTH_AZURE_CLIENT_SECRET are `secretRef`, only non-secret values are plain env; Key Vault Secrets User is granted per secret). Absence from image layers and CI output is covered by the offline checks.
- [x] TLS, diagnostics, backup retention and budget alerts are verified (live 2026-11-16: storage TLS1_2, PostgreSQL `require_secure_transport` on, diagnostic settings on PostgreSQL, Key Vault, ACR and the queue, backup retention 7 days, budget `life-tracker-stage-budget`).
- [ ] Database restore is tested. Not planned on Azure (decision 2026-11-16): the restore test is done on the personal deploy.
- [x] The resource group is deleted with the teardown script and the absence
  of deployed resources is recorded in `docs/STATUS.md`.
- [x] The failed first deployment was torn down and the resource group absence
  was verified. Pre-existing subscription resources are not project-owned and
  are not deleted.
- [x] The queue is unreachable from the internet (403) and a message round-trip works through the private endpoint (live 2026-11-16: a desktop reminder arrived; `docs/azure-evidence/2026-11-16-final-run.md`).
- [x] Both jobs start every minute, read the VAPID secret through their identity and finish without the `enqueue failed:` or `send failed:` log line (live 2026-11-16, after the migration job ran: the first three `enqueue` runs failed because the database role did not exist yet, then every run succeeded; the runs while PostgreSQL was deliberately stopped failed, as expected).
- [x] A test notification reaches a real device (live 2026-11-16, `docs/azure-evidence/2026-11-16-live-run.md`). (A live second-account denial is
  skipped by decision, 2026-11-13; the authorization tests cover it.)
- [x] Alert rules and saved queries exist and the e-mail action group received a test (live 2026-11-16: `web-5xx` fired after PostgreSQL was stopped and the e-mail arrived; the saved queries return rows, checked by the user in the portal; `docs/azure-evidence/2026-11-16-final-run.md`).
