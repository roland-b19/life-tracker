# Decisions

Newest at the bottom of each section. Do not re-litigate a decision without the user asking; add a new dated entry that supersedes it instead.

## Made

- **2026-11-02 — Agent-neutral repo.** `AGENTS.md` is the single source of truth. `CLAUDE.md` / `GEMINI.md` import it; `.github/copilot-instructions.md` points to it. Project knowledge lives in the repo (`docs/`), never only in a chat or an agent's memory, so agents can be swapped mid-project.
- **2026-11-02 — Ponytail vendored.** Rules inlined in `AGENTS.md`, skills copied to `.agents/skills/` (upstream `DietrichGebert/ponytail` at commit `96608e0`). Chosen over the Claude-only plugin so it works for every agent and has no third-party hooks. Update procedure: `docs/TOOLING.md`.
- **2026-11-02 — Graphify installed project-scoped.** Local CLI (`graphifyy` 0.9.100 from PyPI). Code is parsed locally with tree-sitter, nothing leaves the machine. `graphify-out/` is git-ignored (derived, rewritten on every commit by the hook); each machine rebuilds it.
- **2026-11-02 — Two hosting phases.** Phase 1 (course, until January): Azure, scripted, ephemeral. Phase 2 (after the presentation): migrate to a near-free personal stack. Prefer portable building blocks now.
- **2026-11-02 — GitHub.** Private repo `life-tracker` under `roland-b19`, default branch `main`, SSH remote.
- **2026-11-02 — Docs language.** Docs, code and commits in English; the user talks to agents in Romanian.

- **2026-11-02 — Apple design skill.** `.agents/skills/apple-design/` distils all 158 pages of Apple's Human Interface Guidelines (fetched 2026-11-02) into agent-readable references; mandatory for UI work (see `AGENTS.md`). Chosen over designing from memory so every agent produces the same Apple-level result. Refresh procedure in its `SKILL.md`.
- **2026-11-02 — No implementation before the plan.** The user's rule: planning (module-by-module Q&A, then `docs/spec.md`) comes first. App idea captured in `docs/idea.md`.
- **2026-11-02 — Security approach.** ASVS L2 target, NIST SSDF process, MCSB for Azure; no health data ever to an AI provider; platform encryption at rest first; owner-only for now; no external pentest; local pre-commit checks. Details in `docs/security-plan.md`.
- **2026-11-02 — Skills are project-neutral.** Every skill under `.agents/skills/` must work unchanged in another project; project specifics live in `docs/` and `AGENTS.md`. (`apple-design` was cleaned to follow this.)
- **2026-11-02 — Code review skill.** `.agents/skills/code-review-guide/`, named `-guide` to avoid the built-in `code-review` skill. Complements `ponytail-review` (lean-ness) and `secure-development` (security requirements) instead of repeating them.
- **2026-11-02 — project-setup skill lives outside this repo.** `~/Documents/projects/project-setup/` creates any new project with the 5 skills and a fixed structure (agent-neutral `AGENTS.md`, docs skeleton, secret-scan hook, graphify). It bundles copies of the skills; refresh procedure in its `SKILL.md`.
- **2026-11-02 — Planning answers, round 1.** Platform: web/PWA first (works on iPhone via Home Screen and on Mac); Apple Health needs an iOS component, decided later. Users: only the owner for now, multi-user in the design (data isolated per account). Scope: most modules are wanted, built in tiers so the January demo stays safe; module order is decided in the Q&A. First module to design: Gym / sport.
- **2026-11-02 — AI connector for food logging.** The app will expose a remote MCP server so the user's own Claude (Pro/Max) and Gemini (Google AI Plus) chats can log meals without an API. Data line: food (meals, macros, water, recipes, shopping list) yes; body weight, steps and health data never. Macros are AI estimates, flagged "estimated", with a manual entry fallback. Gemini consumer support for custom connectors is unconfirmed (may need Ultra). Needs threat-model and data-inventory entries and `ai-security.md` before building.
- **2026-11-02 — Food and Money details.** Food: fixed weekly meal plan that can be edited per week; recipes kept with optional macros; shopping list grouped by category. Money: expenses only for now, quick-entry form, RON only, and finance data never goes through the AI connector.
- **2026-11-02 — To-do.** Recurring plus single-day tasks, manual only (no auto-entries from other modules), web push notifications via the installed PWA.
- **2026-11-02 — Wedding and Chess modules dropped.** The user removed both from the app's sections. Money no longer needs a wedding category link.
- **2026-11-02 — Wishlist.** Private, owner-only, one list for the user's own wants (name, link, estimated price, priority). Bought items are deleted; no photo, no sharing, no link to Money.
- **2026-11-02 — Health module dropped.** No Apple Health / Apple Fitness integration, so no native iOS component: the app stays web/PWA only. Steps and body weight remain manual daily entries in Food.
- **2026-11-02 — Work opportunities and Projects modules dropped.** Remaining modules: Gym, Food + weight, Money, Daily to-do, Wishlist, Family business (in discussion).
- **2026-11-02 — Family business.** Owner-only dashboard: income + expenses (profit) and a business to-do, separate from the personal modules; no customers/orders/stock for now; finance never goes through the AI connector.
- **2026-11-02 — Tiers.** Tier 1: login, Gym, Food + weight. Tier 2: Money, To-do + notifications, Food AI connector. Tier 3: Business, Wishlist. Money and To-do carry a personal/business space field and are reused by Business.
- **2026-11-02 — Stack and auth direction.** TypeScript full-stack (web/PWA); Microsoft Entra External ID for authentication (OAuth/OIDC, also used by the AI connector); a message queue carries push-notification reminders to a worker. Specific framework, database, compute service and IaC tool are still open.
- **2026-11-02 — Spec approved.** The user approved `docs/spec.md` (modules, tiers, AI data line). Threat model v1 (`docs/threat-model.md`), data inventory and risk register (`docs/security/`) written from the approved spec; they get refined when the stack is chosen.
- **2026-11-02 — Stack chosen.** Next.js (TypeScript, one app for UI/PWA, API and MCP endpoint) + a separate worker process; Azure Database for PostgreSQL Flexible Server (private access only); Azure Container Apps (containers, scale-to-zero) with Azure Container Registry; Azure Storage Queue for push reminders (a per-minute job enqueues due reminders, the worker sends the web push). Auth: Entra External ID. Chosen for portability to the phase-2 near-free stack (standard SQL, containers, plain queue semantics). Costs are rough estimates from memory (PostgreSQL B1ms about 12-15 USD/month, ACR Basic about 5 USD/month): verify in the Azure pricing calculator before deploying. IaC tool still open.
- **2026-11-02 — IaC tool: Bicep.** Azure-native, no state file to protect, fits the deploy / work / delete-the-resource-group cycle (`az deployment group create`, `az group delete`). Terraform not chosen: needs secret state kept outside the repo and does not help phase 2, which uses different hosting. Plain `az` scripts only for small glue steps. Nothing is deployed without the user's explicit OK.
- **2026-11-02 — Iteration 1 plan approved (implementation deferred).** Plan in `docs/iteration-1.md`: local-only security spine with the weigh-in slice. Approved: npm, Next.js, Drizzle ORM (`drizzle-orm`, `drizzle-kit`, `pg`), zod, Auth.js (`next-auth`), Vitest, ESLint; local sign-in as a dev-only provider guarded against production (option a). The user chose not to start coding yet.
- **2026-11-03 — Only iteration 1 is implemented now; the roadmap is an estimate.** `docs/roadmap.md` lists the later iterations as a rough order and size estimate only. After iteration 1 the work stops until the user and the agent agree the next iteration, which then gets its own plan. Rule added to `AGENTS.md` (scope guard).

- **2026-11-03 — Iteration 1 implementation.** The local security spine uses Next.js 16, stable `next-auth` 4.24.15, Drizzle ORM, PostgreSQL 17, strict Zod validation, owner-scoped weight routes, and Vitest authorization tests. Development credentials are refused when `NODE_ENV=production`; Entra and Azure remain deferred.
- **2026-11-03 — Iteration 2 plan approved and local phase completed.** Iteration 2 covers the Azure foundation plus real Entra External ID login for the existing weigh-in slice. The local 2A phase is complete; Azure validation (2B) remains gated by supported scripting, a region/SKU cost estimate, explicit user approval, private database networking and a tested teardown.
- **2026-11-03 — Iteration 2A/2B split.** Iteration 2A is local-only: production container, environment-driven OIDC configuration, offline-compiled private-network Bicep and guarded scripts. Iteration 2B is a short Azure validation window, paused until the user explicitly starts it; no Azure resources are created during 2A.
- **2026-11-03 — Phase 2B first deployment attempt.** `belgiumcentral` passed `what-if`, but deployment failed because PostgreSQL `Standard_B1ms` had no capacity and ACR Basic does not support disabled public access. The partial resource group was deleted. A retry must use a capacity-available PostgreSQL SKU and ACR Premium (or a reviewed private-access alternative), with a new cost check.
- **2026-11-03 — PR #8 infrastructure remediation.** ACR is set to Premium because Azure does not support private endpoints with Basic. This is a cost-increasing change from the rough Basic estimate; the existing cost gate remains mandatory and deployment must wait for the user's explicit approval of the revised regional estimate. Container Apps requires non-empty deployment parameters for the database URL, Auth.js secret, OIDC settings and callback URL; secret values are written to Key Vault and referenced by a pre-created user-assigned identity, while `AUTH_DEV=false` is fixed in the template.
- **2026-11-03 — Azure cleanup and handoff.** The Life Tracker resource group and all project resources were verified absent. The teardown script now waits for deletion, verifies the group is gone, and succeeds safely when it is already absent. Pre-existing subscription resources such as Network Watcher are outside project ownership and must not be deleted.
- **2026-11-03 — TypeScript 7 toolchain compatibility.** TypeScript 7.0 has no
  compiler API, so the official migration guidance is used: the `typescript`
  dependency aliases `@typescript/typescript6` for `typescript-eslint`, while
  `@typescript/native` aliases TypeScript 7 and supplies the `tsc` binary.
  This keeps linting on the supported API without weakening checks and makes
  the TypeScript 7 compiler available to CI.
- **2026-11-03 — Immutable production images and deferred moderate advisories.**
  Production infrastructure accepts only `sha256:<64 lowercase hex characters>`
  image references; the deploy script performs the exact boundary check and
  Bicep constructs an `@digest` reference, never a mutable tag. CI archives an
  SPDX SBOM and fails on HIGH/CRITICAL container vulnerabilities. The remaining
  moderate development dependency advisories are deferred because npm's
  available fixes require major upgrades that would recreate the rejected
  TypeScript/ESLint incompatibility; review them on the next compatible
  toolchain release.
- **2026-11-03 — Azure 2B preparation: regional capacity, telemetry and multi-stage deploy script.**
  Read-only audit showed `westeurope` and `germanywestcentral` restrict subscription provisioning;
  permitted regions include `belgiumcentral`, `northeurope`, `francecentral`, `swedencentral`,
  and `polandcentral`. In `belgiumcentral`, burstable PostgreSQL is limited to `Standard_B1ms` and
  `Standard_B2s`; Bicep parameterizes `postgresSku` with default `Standard_B1ms`. Bicep was enhanced
  with diagnostic settings on PostgreSQL, Key Vault, and ACR to Log Analytics, and a consumption
  budget alert resource (`Microsoft.Consumption/budgets`). `scripts/azure-deploy.sh` was enhanced
  to run `what-if` preview first and require multi-stage explicit approvals (`DEPLOY_APPROVED=YES`,
  `COST_GATE_APPROVED=YES`, `CONFIRM_DEPLOY=YES`) without echoing secrets. Revised cost estimate:
  ACR Premium (~$50/mo continuous, ~$0.07/hr ephemeral) + PostgreSQL Burstable (~$16-$28.50/mo, ~$0.022-$0.039/hr),
  costing ~$0.20 - $0.35 total for a short 1-2 hour validation test. No Azure resources were created.
- **2026-11-03 — Phase 2B regional routing, Key Vault purge-protection conflict resolution, and Italy North target.**
  Deployment attempts in `polandcentral` (`SkuNotAvailable` on Burstable) and `belgiumcentral` (`RegionalAllocationFailed`
  due to data center capacity exhaustion on `Standard_B2s`) failed and were immediately torn down synchronously.
  Three critical infrastructure root causes were resolved and codified:
  1. The built-in Azure RBAC role definition GUID for "Key Vault Secrets User" was queried directly from the subscription
     and set to `4633458b-17de-408a-b874-0445c86b69e6` in `infra/main.bicep` and contract tests.
  2. Because Key Vault has purge protection enabled, deleted vaults cannot be purged until their retention period expires;
     Key Vault names are now derived with a deterministic resource-group hash (`${suffix}kv${uniqueString(rg.id)}`),
     preventing `ConflictError` on recreation.
  3. ACR DNS caching on global Azure Traffic Manager after region switches was resolved by adding a regional `registryName`
     parameter and switching ACR authentication in `scripts/azure-deploy.sh` to non-interactive short-lived OAuth tokens
     (`az acr login --expose-token`), eliminating terminal interactive prompts.
  4. The user approved target region `italynorth` with `Standard_B1ms` / `Standard_B2s` for the live validation retry.

- **2026-11-03 — Target region Italy North and capacity findings.** Poland Central was rejected by subscription policy (`SkuNotAvailable` for PostgreSQL Burstable), Belgium Central failed with physical host allocation limits (`RegionalAllocationFailed` on `Standard_B2s` and `Standard_B1ms`). Italy North was approved and succeeded with PostgreSQL Flexible Server `Standard_B1ms`, ACR Premium, Key Vault, and Container Apps.
- **2026-11-03 — Bicep private DNS zone group dependency ordering.** Azure Container Apps in a VNet failed image resolution with `lookup <acr>: no such host` because ARM was executing the Container App revision creation concurrently with the ACR Private Endpoint and Private DNS Zone Group. Declared explicit dependencies in `infra/main.bicep` on `registryPrivateDnsGroup`, `vaultPrivateDnsGroup`, and secrets to guarantee private DNS A-record registration prior to image resolution.
- **2026-11-03 — Automated database schema migration via Container App Job.** In private networking mode with public network access disabled on PostgreSQL, external clients cannot reach the database. Created `scripts/db-init.cjs` and automated database bootstrap (database creation, least-privilege `life_tracker_app` role provisioning, and DDL execution) via `Microsoft.App/jobs` (`lt-migrate-stage`) running inside the private VNet.
- **2026-11-03 — Iteration 2 verified live and torn down.** All requirements of Iteration 2 (Azure foundation, private PostgreSQL, Key Vault secrets injection, ACR private link, live HTTPS `/health`, CSRF protection, and real Microsoft Entra ID OIDC redirect) were tested and verified on live Azure infrastructure. Full teardown completed cleanly with 0 project resources remaining.
- **2026-11-03 — Iteration 3: Gym module planning and local-first execution.** Approved detailed plan in `docs/iteration-3.md`. Development will proceed 100% locally using local PostgreSQL and Vitest, avoiding repetitive Azure deployments to save time and credits. Live cloud deployment is deferred until later milestones.
- **2026-11-04 — Iteration 3 complete, PR #13 merged.** Gym module fully implemented with 5-day Upper/Lower split, set logger (`reps x load`), automatic `!!` anomaly markers, PR tracking, 5-week deload tracker, Apple HIG UI, and 23 passing tests.
- **2026-11-04 — Iteration 4: Food & Nutrition + Body Weight Complete planning.** Approved detailed plan in `docs/iteration-4.md`. Local-first development for daily macros (3350 kcal, 170g protein, 300g carbs), water tap counter (3L), steps (10k), 7-day weight trend analytics, meal planning, and auto-generated shopping list. Remote AI connector remains scheduled for Iteration 7.
- **2026-11-04 — Tier 1 complete, Iteration 4 merged, Iteration 5 planned.** Comprehensive audit of Tier 1 verified all modules (Auth, Gym, Food, Weigh-ins with 7-day rolling average and weekly rate of change). Approved detailed plan in `docs/iteration-5.md` for Iteration 5 (Money module: personal & business expenses, RON currency, fast 2-3 tap entry, category breakdown, strict AI quarantine). Local-first execution on branch `feat/iteration-5-money`.

## Open

- Region selection for Phase 2B is approved (`italynorth`); awaiting final live validation.
- Authorization model details (owner-only now; account-scoped data).
- Public vs private repo, and a license, once the project is shared.
