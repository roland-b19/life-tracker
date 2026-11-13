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
  restarts, queue backlog and worker failures, four saved Log Analytics queries.
- [x] CI builds, scans (Trivy) and audits the worker image and its own dependencies.

## Phase 2B: evidence required after explicit approval

- [ ] `az deployment group what-if` reviewed against the final deployment
  parameters (no deployment has been run in this audit).
- [ ] No public database, Key Vault or registry endpoint is reachable.
- [ ] Runtime identity pulls from ACR without admin credentials.
- [ ] Secrets are injected from Key Vault and absent from image layers, logs
  and CI output (template contract is validated locally; deployment evidence
  remains required).
- [ ] TLS, diagnostics, backup retention and budget alerts are verified.
- [ ] Database restore is tested.
- [x] The resource group is deleted with the teardown script and the absence
  of deployed resources is recorded in `docs/STATUS.md`.
- [x] The failed first deployment was torn down and the resource group absence
  was verified. Pre-existing subscription resources are not project-owned and
  are not deleted.
- [ ] The queue is unreachable from the internet and a message round-trip works
  through the private endpoint (enqueue job writes, send job reads, deletes).
- [ ] Both jobs start every minute, read the VAPID secret through their identity and
  finish without the `enqueue failed:` or `send failed:` log line.
- [ ] A test notification reaches a real device; a second Entra account is denied
  another user's task.
- [ ] Alert rules and saved queries exist and the e-mail action group received a test.
