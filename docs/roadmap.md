# Roadmap (ESTIMATE ONLY, not approved for implementation)

**Do not implement anything from this file.** Iteration 1 is complete. Iteration 2 now has a detailed, separate plan in `docs/iteration-2.md`, but it is not approved for implementation until the user accepts it and explicitly approves the first Azure deployment after the cost gate. This roadmap remains a rough order and size estimate; later iterations still need their own plans.

Sources: `docs/spec.md` (what each module does, approved), `docs/decisions.md` (tiers, stack), `docs/requirements.md` (course checklist). Sizes are guesses of agent work: S under half a day, M about a day, L several days. Nothing was measured.

Note on words: the course calls every deploy-work-delete cycle an "iteration". Here an iteration is a planned chunk of work. Only the Azure ones deploy anything.

## Overview

| # | Iteration | Tier | Size | Covers course requirement |
|---|---|---|---|---|
| 1 | Local security spine (weigh-in slice) | 1 | M | 4 (partly), 6 (partly) |
| 2 | Azure foundation and real login | 1 | L | 1, 2, 3, 4, 7, 8 |
| 3 | Gym | 1 | L | 6 |
| 4 | Food and body weight (complete) | 1 | L | 6 |
| 5 | Money | 2 | M | 6 |
| 6 | Daily to-do, push notifications, queue | 2 | L | 5 |
| 7 | Food AI connector (MCP) | 2 | L | 4 (OAuth for a second client) |
| 8 | Wishlist and Family business | 3 | M | 6 |
| 9 | Course finish: hardening, demo, teardown | n/a | M | all |

Iteration 2 is in progress. The rest are estimates.

## 2. Azure foundation and real login
Why second: the course grades the Azure parts and the security, and the deploy cycle should be rehearsed early, not in January.
- Install Azure CLI, `az login`, confirm the credit; cost estimate from the Azure pricing calculator, shown to the user before any deploy.
- Entra External ID tenant and sign-in replacing the dev provider (keyed by issuer + subject); check whether the tenant can be scripted.
- Deploy Dockerfile (non-root, minimal image).
- Bicep: resource group with tags, VNet, PostgreSQL Flexible Server with private access only, Container Registry, Container Apps, Key Vault, managed identity, logging.
- Deploy and teardown scripts; refine the `(stack)` rows of `docs/threat-model.md`; verify the database is unreachable from the internet.
- Needs from the user: explicit OK before creating any resource, the Entra tenant, the Azure credit state.
- Done when: the weigh-in slice runs on Azure behind real login, then everything is torn down with one command.

## 3. Gym
- Scope exactly as in `docs/spec.md` (Gym section) and the seed data in `docs/spec/gym-sample.md`.
- Decision first: where the exercise library comes from and its licence.
- Reuses the iteration 1 patterns: user-scoped data layer, `requireUser()`, the authorization test table.

## 4. Food and body weight (complete)
- Scope as in `docs/spec.md` (Food section): meals, macros entered by hand, water, recipes, meal plan, grouped shopping list, steps, and the full weight feature built on the iteration 1 slice.
- The AI connector is a separate iteration (7); this one is manual entry only.

## 5. Money
- Expenses only, RON only, quick form, personal/business `space` field (reused later by Business). No AI. See the Money section of the spec.

## 6. Daily to-do, push notifications, queue
- Recurring and single-day tasks, reminder time, carry-over, streak, daily stats, as in the spec.
- Azure Storage Queue, a per-minute job that enqueues due reminders, a worker that sends web push, PWA manifest and service worker.
- Likely needs a deployed environment to test push for real, so it is an Azure iteration (deploy, work, tear down).

## 7. Food AI connector (MCP)
- The app as a remote MCP server for the user's own Claude (and Gemini if its custom connectors turn out to be available, risk R5).
- Per-user OAuth, a narrow `food` scope, food-only tools, input validation, rate limits, a kill switch, model output treated as untrusted. Weight, steps, money and business data never exposed. Requirements in the spec and `docs/threat-model.md` (T8, T9).
- Needs from the user: confirm which AI accounts can use custom connectors.

## 8. Wishlist and Family business
- Wishlist: private list (name, link, estimated price, priority), delete only.
- Business: dashboard of income and expenses (profit) plus a business to-do, built by reusing the Money and To-do implementations with the `space` field.

## 9. Course finish
- Walk through `docs/requirements.md` row by row with evidence, fill `docs/security/asvs-matrix.md`, run the full security checks, rehearse the deploy and teardown, prepare the presentation, confirm nothing is left running.
- Then phase 2 (near-free hosting for personal use) is planned separately.

## Open questions that affect the roadmap
- Whether the Azure iteration should come before Gym and Food (proposed) or after them.
- The January deadline: which iterations must be done and deployed for the presentation (Tier 1 plus the Azure foundation is the minimum implied by the requirements checklist).
- Entra External ID cost and scriptability.
