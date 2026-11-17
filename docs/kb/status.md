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
| Workflow install (KB, skills, checks, CI job, branch protection on `main`) | done (PR #133) |
| CI audit blocks on production dependencies only | done (PR #134, D-004) |

## In progress
Nothing.

## Next steps
1. First end-to-end spec for the main UI flow (none exists yet).
2. When picomatch has a fixed release, revisit the report-only dev-tool audit step (D-004).

## Open questions
- The test password is duplicated in `tests/setup.ts`; the Azure scripts keep a `postgres_server` fallback and a default host in `db-init.cjs`.
- `scripts/backup-now.sh`, `scripts/import-personal.cjs` and `scripts/azure-preflight.sh` have no npm script or caller (kept as manual tools; D-003 for the last).
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
