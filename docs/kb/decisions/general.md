---
summary: Decisions on the product's hosting and overall shape, with their reasons and rejected alternatives.
last_verified: 2026-11-18
---

# Decisions: general

Newest at the bottom. Entry format: `.claude/skills/maintain-kb/assets/decisions.md`. Superseded and obsolete decisions move to `archive/decisions.md`.

## D-001: Run live on Vercel + Neon; keep Azure for course demos only (2026-11-18)
- **Why:** Cost: Vercel and Neon free tiers cost nothing, Azure costs money. Simplicity: less infrastructure to run for one user. Recorded from the owner's answer on 2026-11-18; the move itself happened earlier in November 2026.
- **Rejected:** Running the app on Azure permanently (costs money, more to operate for personal use).
- **Status:** active. Consequences: push reminders are off on the Vercel variant (the worker needs Azure Storage Queue), and the free-tier query budgets are tested ([domain](../domain.md)).

## D-002: One check command, `npm run check`, run by the Stop hook and CI (2026-11-18)
- **Why:** The verify skill needs one headless command; CI runs it as written. It chains lint, typecheck, Vitest and the KB check, so the local hook and CI give the same answer. Vitest stays (golden rule 1: it was already the runner).
- **Rejected:** A check without tests (faster, but hides DB regressions); no Stop hook until Postgres runs locally (checks would only run in CI). The owner chose the full command and will start Postgres with `docker compose up` when working.
- **Status:** active. The end-to-end tool was chosen later in D-005. Screenshot tests were not requested.

## D-003: Keep `azure-preflight.sh` and the unused schema columns (2026-11-18)
- **Why:** `scripts/azure-preflight.sh` is a manual tool for the Azure course demos (D-001), like `backup-now.sh` and `import-personal.cjs`. The columns `daily_metrics.notes`, `workout_split_days.order_index` and `workout_splits.is_active` may hold rows in the live database, and migrations are additive only; dropping them needs a migration the owner runs. Both chosen by the owner on 2026-11-18.
- **Rejected:** Deleting the script (the demos need it); dropping the columns now (risk to live data for no gain).
- **Status:** active. A column is removed only in its own change, after a search proves nothing reads it.

## D-004: CI blocks on production dependency advisories only (2026-11-18)
- **Why:** The picomatch advisory GHSA-fc5q-39xc-vjpf (high) covers every published version and has no fix; only dev tools (vitest, vite, eslint, drizzle-kit) pull picomatch in. `npm audit --omit=dev` finds 0 vulnerabilities. A full audit as a blocking step kept `main` red from 2026-11-17. Chosen by the owner on 2026-11-18 (PR #134).
- **Rejected:** Waiting for an upstream patch (weeks, `main` blocked meanwhile); `npm audit fix --force` (downgrades vitest to 3.1.4); bypassing branch protection.
- **Status:** active. The full audit still runs as a report-only step (`continue-on-error`). Revisit when picomatch has a fixed release.

## D-005: End-to-end specs with Playwright Test on `next dev`, Chromium desktop and phone (2026-11-18)
- **Why:** The verify skill already prescribes Playwright Test (golden rule 1), and it adds a real browser check for the UI flows Vitest cannot see. Specs run against `next dev` because `AUTH_DEV=true` throws under `NODE_ENV=production`, so `next start` cannot sign in. Targets follow the conventions page: Chromium at desktop size and at 375px. `@axe-core/playwright` scans every page a spec visits. `npm run e2e` stays out of `npm run check` so the Stop hook stays fast; CI runs both. Chosen by the owner on 2026-11-18 ("all recommended, axe included"); the first spec is the Wishlist flow ([plan](../plans/e2e-first-spec.md)).
- **Rejected:** Cypress or Vitest browser mode (heavier or still needs Playwright, no gain); Firefox and WebKit projects (slower CI, the KB targets are Chromium only); running specs against a production build (AUTH_DEV forbids it); the dev database `life_tracker` (test data would mix with seed data); e2e inside `npm run check` (a browser run at every stop).
- **Status:** active.

## D-006: Weight is a server action, not a REST API (2026-11-18)
- **Why:** Golden rule 1: weight was the only JSON API (its commit predates the server-action convention) and nothing recorded a reason to keep it. Chosen by the owner on 2026-11-18. The weight card calls `saveWeightAction`, `deleteWeightAction` and `restoreWeightAction` in `src/app/actions/food.ts`; data access and schemas moved into `src/lib/food.ts` and `src/lib/validations/food.ts`. Saving sets the day's weight on the server (create, or change the row the day already has, and report the replaced row), which replaces the client's 404/409 retry sequence. Undo of an edit saves the old value again; Undo of a delete restores under the old id. Next checks the Origin of every server action call, so `isSameOrigin`, the generic API error body and the request logger (used only by weight) were deleted.
- **Rejected:** Keeping the routes for a possible future client (no second client exists); separate create and update actions (the stale-screen cases need a lookup first).
- **Status:** active. Saves take the per-user advisory lock (`lockUser`, scope `weight`), so two saves of the same new day at once become a create and an edit instead of a unique violation.

