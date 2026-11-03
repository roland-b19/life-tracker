# Azure hardening checklist

This is the local design checklist for iteration 2A. No item here proves that
an Azure resource exists or is configured; phase 2B must attach deployment
evidence before marking an item complete.

## Phase 2A: designed and locally validated

- [x] Resources have `project`, `env` and `owner` tags in `infra/main.bicep`.
- [x] PostgreSQL uses a delegated subnet, private DNS and public access disabled.
- [x] Key Vault uses RBAC, soft delete, purge protection and a private endpoint.
- [x] ACR disables admin credentials and uses a private endpoint.
- [x] Container Apps uses a VNet-integrated environment and managed identity
  for ACR pull.
- [x] HTTPS-only ingress, a liveness probe and a scale limit are declared.
- [x] The Bicep template compiles with `az bicep build`.
- [x] Deploy and teardown scripts are versioned; the phase 2A deploy script
  refuses to deploy without explicit cost and deployment gates; teardown is
  idempotent, waits for deletion and verifies the resource group is absent.

## Phase 2B: evidence required after explicit approval

- [x] `az deployment group what-if` reviewed before the first deployment.
- [ ] No public database, Key Vault or registry endpoint is reachable.
- [ ] Runtime identity pulls from ACR without admin credentials.
- [ ] Secrets are injected from Key Vault and absent from image layers, logs
  and CI output.
- [ ] TLS, diagnostics, backup retention and budget alerts are verified.
- [ ] Database restore is tested.
- [x] The resource group is deleted with the teardown script and the absence
  of deployed resources is recorded in `docs/STATUS.md`.
- [x] The failed first deployment was torn down and the resource group absence
  was verified. Pre-existing subscription resources are not project-owned and
  are not deleted.
