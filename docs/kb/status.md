---
summary: Where the project stands: roadmap, work in progress, next steps, open questions and tracked migrations.
last_verified: 2026-11-18
---

# Status

## Roadmap
| Stage or feature | State |
|---|---|
| Wishlist, Tasks, Gym, Food and health, Settings, export | done, live on Vercel + Neon |
| Azure course setup (infra, worker, push) | done, torn down, kept for demos |
| Weekly encrypted backup | done |
| Workflow install (KB, skills, checks, CI job) | in progress |

## In progress
Installing the workflow on branch `worktree-install-workflow`: KB (this page set), then one check command, Stop hook, CI job, risk tiers, PR.

## Next steps
1. One `npm run check` (lint, typecheck, tests, KB check) and a `checks` step in `ci.yml`.
2. First end-to-end spec for the main UI flow (none exists yet).
3. Optional: branch protection on GitHub, only with the owner's separate OK.

## Open questions
- `@typescript/native` (`npm:typescript@^7`) devDependency: unreferenced, but has `bin: tsc` and may collide with `typescript` aliased to `@typescript/typescript6`. Remove?
- `scripts/azure-preflight.sh` has no caller. Keep for demos or remove?
- Possibly unused schema columns: `daily_metrics.notes`, `workout_split_days.order_index`, `workout_splits.is_active` (always true). Production rows may exist, so a removal needs a migration the owner runs.
- Env vars used but missing from `.env.example`: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `CLAUDE_BIN`, `SEED_DAYS`. Document them?
- The test password is duplicated in `tests/setup.ts`; the Azure scripts keep a `postgres_server` fallback and a default host in `db-init.cjs`.
- `scripts/backup-now.sh` and `scripts/import-personal.cjs` have no npm script (kept as manual tools).
- **Weight REST vs server actions.** Investigated 2026-11-18: weight was the first feature (commit b34a649, 2026-11-03, "iteration one security spine") and was built as a JSON API with same-origin, session and error-contract checks plus `tests/authorization.test.ts`; every later feature used server actions. No recorded reason to keep it. Only `app/food/weight-card.tsx` calls it. It is listed under Tracked migrations; the owner has not decided when to migrate.

## Tracked migrations
Deprecated patterns still in use (golden rule 1). New code never uses them; migrating is its own change.
- **Weight REST API** (`app/api/weight/*`, `src/server/weight.ts`, `app/food/weight-card.tsx`) → server action in `src/app/actions/food.ts` with the same authorization tests. The REST authorization test in `tests/authorization.test.ts` goes with it.
- **Hand-rolled Undo blocks** (about 8 files) → `undoWith()` from `app/components/toast.tsx`, used in 3 files today.
- **uuid validation:** `z.string().uuid()` (about 20 places) → `uuid` from `src/lib/validations/common.ts`.
- **Action validation and errors:** four styles (throwing parse, `check()` in gym, `safeParse`, hand-written in `food.ts`) and four error contracts (thrown Error, `{success,error}`, `GymRefusal`, null) → one of each, to be chosen.
- **Form error state names:** `error`, `errorMsg`, `formError`, `titleError` → one name.
- **Device-local dates:** gym `getDay()` and food `toTimeString()` → `APP_TZ` helpers in `src/lib/format-date.ts`.
- **Import style:** `@/` (57 files) vs relative (41 files) → `@/`.
- **Test setup duplication:** `seedUser` in 11 test files and the `authState` mock in about 10 → one shared helper in `tests/`.
- **Pages calling `getServerSession` directly** although `RequireSession` guards the layouts (the pages test requires the check, so this stays until that test changes).
- **Layout of logic:** `src/server/weight.ts` vs `src/lib/<feature>.ts`; `src/app/actions` next to the root `app/`; add vs create function names; the "Health" label vs the `/food` route; `revalidatePath` only in gym.
- **CSS:** duplicate selectors `.entry-row`, `.todo-row`, `.item-link-text` in `app/globals.css`.
- **Chat role `"model"`:** a Gemini leftover in the food chat history.
- **`pg` version pinning:** root uses `^`, `worker/` exact.
