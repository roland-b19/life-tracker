# Azure: plan to prove every requirement

Goal: every requirement in `docs/requirements.md` and every rubric line (observability, deployment) is **seen working on a real, short-lived deployment**, with evidence kept in the repo, then everything is deleted. Today most items are only "implemented, tested offline"; the live status of each is in `docs/azure-requirements.md`.

Rules that apply to the whole plan (`AGENTS.md`):
- No command that creates, changes or deletes Azure resources runs without the user's explicit OK in the session. Read-only `az` commands are fine once the user is signed in.
- No secrets in chat: the VAPID keys, the Entra client secret and the database password are generated and entered by the user outside chat.
- Estimated cost is stated before the run; resources are tagged `project=life-tracker`, `env=<name>`; teardown ends the run.

## Phase 0: offline fixes (no Azure, no cost)

| # | Task | Done when |
|---|---|---|
| 0.1 | Bring the migration-job fix back: reopen or cherry-pick `fix/azure-migrate` (PR #104, `scripts/azure-migrate.sh`, the rehearsal notes) and merge through a PR. The user closed it, so ask first. | The fix and the 2026-11-13 notes are on `main`. **Done 2026-11-16** (PR from `fix/azure-migrate-main`, user said go ahead). |
| 0.2 | Fix `docs/presentation.md`: diagnostics are on PostgreSQL, Key Vault, ACR and the queue; Container Apps logs go through `appLogsConfiguration`. | Doc matches `infra/main.bicep`. |
| 0.3 | Run every offline gate: `npm test` (incl. `tests/infra-contract.test.ts`, `tests/worker.test.ts`), lint, typecheck, `az bicep build`, CI green on `main`. | All green, results noted in `docs/STATUS.md`. **Done 2026-11-16** (CI on the PR still to confirm). |
| 0.4 | Review the Bicep against the requirements once more, line by line (public access flags, role scopes, tags, diagnostics, alert rules, budget). | A short list of gaps, or "none". **Done 2026-11-16:** one gap, the migration job's plain-text secrets, fixed in the script; verify on the live run. |
| 0.5 | Decide the open design points (see "Decisions needed"). | Answers recorded in `docs/decisions.md`. |

## Phase 1: preparation with the user (little or no cost)

1. Read-only: `az account show`, remaining credit. (`life-tracker-stage` is confirmed gone, 2026-11-16.)
2. Entra: an app registration with the redirect URI of the future web app, and the owner's account (a second test account is skipped by decision, 2026-11-13). The user creates the client secret outside chat.
3. The user generates the VAPID key pair and chooses the budget e-mail.
4. `scripts/azure-preflight.sh` (read-only) passes.
5. State the cost estimate and get the go-ahead for the live run.

## Phase 2: the live run (about 1 to 2 hours, then delete everything)

Deploy with `scripts/azure-deploy.sh` (what-if first, cost gate, digests, migrations as a job). Then check each row and save the evidence in `docs/azure-evidence/` (command output or a screenshot, no secrets, no personal data).

| Req | Check | Pass criterion |
|---|---|---|
| 7 Scripted deploy | What-if output reviewed, deploy finishes, migration job succeeds. | Exit 0, tables exist (row count of a migrations table). |
| 1 Compute | Web app has a URL and answers; `enqueue` and `send` job executions appear every minute. | `az containerapp job execution list` shows runs with status `Succeeded`. |
| 2 Database / storage | Database reachable by the app (a task saved and read back); the `reminders` queue exists; the registry holds the images. | Task survives a reload; `az storage queue list` (through the allowed path) or the portal shows the queue. |
| 3 Secured | Public access flags on PostgreSQL, Key Vault, ACR, storage; shared-key off; Key Vault and ACR answer 403 to `curl` from outside; PostgreSQL port unreachable from outside; secrets not visible in the app's environment dump or image. | All flags `Disabled`/`false`; outside access refused or 403. |
| 4 Auth | Sign in with the Entra owner account on the deployed URL; open the app signed out; run the authorization tests (owner allowed, other user denied, anonymous denied). | Sign-in works; anonymous is redirected to sign-in. Isolation between users is shown with the authorization tests, not live. |
| 5 Queue | Create a task with a reminder one to two minutes ahead; follow it: enqueue log line, queue message (ids only), send log line, notification on the phone. | Notification arrives on the real device; no `enqueue failed:` or `send failed:` line. |
| 6 Functionality | Walk through tasks, wishlist, health, gym, shopping on the deployed app. | Each module works against the Azure database. |
| 8 Cloud backend + DB | Covered by 1, 2, 3 and the walkthrough in 6. | See those rows. |
| Observability | Run each saved query and see rows; trigger an alert (a deliberate 5xx, or stop and restart a replica) and see the e-mail; send a test notification from the action group; confirm the budget exists. | Query results, a received e-mail, alert history screenshot. |
| Deployment | Run `scripts/azure-teardown.sh`, then `az group exists` returns false. | Group gone; "Deployed Azure resources" in `docs/STATUS.md` says none. |

Optional, with its own approval because it creates a second database server: a **point-in-time restore** of PostgreSQL, to show the backup works on Azure. Otherwise show the configured backup retention and say the restore test was done on the personal deploy.

## Phase 3: close the loop

1. Update the status columns in `docs/requirements.md`, `docs/azure-requirements.md`, `docs/presentation.md` and the checklist in `docs/security/azure-hardening.md` (Phase 2B boxes), each with a pointer to its evidence file.
2. Update the one-pager if anything changed; regenerate the PDF.
3. Add the live-run notes to `docs/STATUS.md` and the decisions to `docs/decisions.md`.

## Phase 4: presentation rehearsal

Follow the demo script in `docs/presentation.md` (about 8 minutes). One more short deploy is needed on the day before or the day of the presentation, since nothing stays running. Rehearse the deploy time and have the evidence files as a fallback if the deploy fails.

## Decisions needed

1. **Region and credit:** use `italynorth` again (it worked on 2026-11-13), or another?
2. **Restore test on Azure:** do it (small extra cost) or just show the retention setting?
3. **How to trigger the 5xx alert:** a deliberate bad request needs a safe endpoint; if there is none, stop a replica instead.
4. **Claude Assistant stays off on Azure** (current decision): keep it so?

## Known gaps this plan closes

Not seen live so far: Entra sign-in, a real reminder round trip, alert firing, saved queries returning rows, action-group e-mail, TLS and diagnostics checks, Key Vault secrets read by the jobs over private DNS, database restore on Azure.
