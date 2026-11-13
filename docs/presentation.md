# Presentation plan: Life Tracker on Azure

Maps the course grading slide (`docs/requirements.md`, "Grading rubric") to what we show. Status: **everything below is verified offline only** (Bicep build, contract and worker tests, CI). The live parts need a rehearsal the user approves first; mark each item here when it has been seen working.

## 1. Specification (part of the 30%)

Life Tracker is a personal tracker: tasks with reminders, wishlist, health (weight, water, steps, food), gym and shopping. One codebase, two hosts: Azure (this course, ephemeral) and Vercel + Neon (personal, permanent, untouched by the course work). The story for the talk: requirements, then the data it holds (personal and health data, so security is the main design driver), then the two ways to run it.

## 2. Design (part of the 30%)

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
 Log Analytics: diagnostics, 4 alert rules → e-mail, 4 saved queries
```

Design choices worth saying out loud:
- No data service has a public endpoint; every private endpoint has its own private DNS zone.
- No secret in an image or a connection string: managed identities and Key Vault references.
- The queue message holds ids only; the worker rechecks owner and task before it sends.
- The send job is scheduled, not event-driven, because the GA jobs API cannot scale on a queue with a managed identity (it would need a storage key). Cost: about one minute of delay (`docs/decisions.md` 2026-11-13).

## 3. Implementation (part of the 30%)

Show: `infra/main.bicep` (one template, tagged resources), `worker/` (small, isolated, own dependencies), `tests/worker.test.ts` and `tests/infra-contract.test.ts` (security rules as tests), the CI gates (lint, typecheck, tests, Trivy, SBOM, gitleaks, audit, Bicep build).

## 4. Fundamental services (40%)

| Area | Where it is |
|---|---|
| Compute | Container Apps: web app plus the enqueue and send jobs (and the migration job) |
| Storage | PostgreSQL Flexible Server (data), Storage Queue (reminders), ACR (images) |
| Networking | VNet, delegated and private-endpoint subnets, four private DNS zones, public access off on PostgreSQL, Key Vault, ACR and the storage account |
| Security | Entra sign-in, owner-scoped authorization with tests, Key Vault, user-assigned managed identities with scoped roles, no shared keys, HTTPS only |

## 5. Observability (10%)

Log Analytics with diagnostic settings on PostgreSQL, Key Vault, ACR, Container Apps and the queue; an action group (e-mail to the budget contact); alert rules for web 5xx, replica restarts, queue backlog and worker failures; four saved queries (web errors, reminder runs, queue activity, vault access). Demo: run a saved query, then trigger a rule with a deliberately bad request.

## 6. Deployment (10%)

`scripts/azure-preflight.sh` (read-only), `azure-deploy.sh` (what-if first, cost gate, images pushed and deployed by digest, migrations as a job), `azure-teardown.sh` (deletes the resource group and verifies it is gone). Everything is deleted after each iteration, as the course asks.

## 7. Demo script (about 8 minutes, needs a live rehearsal first)

1. Show the resource group and its tags; no public data endpoints (portal networking blades, or `az` commands).
2. Sign in with the Entra account; show another account cannot read the first one's tasks.
3. Add a task with a reminder one minute ahead; show the enqueue job run, the queue message (ids only), the send job run and the notification on the phone.
4. Show Key Vault references, the managed identity roles and the alert rules.
5. Run a saved Log Analytics query.
6. Run the teardown script and show the group gone.

## 8. Cost

Estimates, not measurements: an ephemeral 1 to 2 hour run is about 0.20 to 0.35 USD (the earlier regional audit in `docs/STATUS.md`). The queue storage account and two one-minute jobs add pennies for that window. Running 24/7 would be about 80 to 100 USD a month, which is why the plan is to deploy, rehearse, present, tear down.

## Not done / not verified

- No live Azure run of the reminder pipeline yet (role propagation, the jobs reading Key Vault secrets over private DNS, metric and table names used by the alerts and saved queries).
- Claude Assistant is off on Azure by decision.
- Entra callback and second-account denial still need a live check.
