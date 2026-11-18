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
| First e2e spec (Wishlist, Playwright, D-005) | done, [plan](plans/e2e-first-spec.md) |
| One source for the local test credentials; dead Azure host fallbacks removed (D-006) | done |
| Weight REST API → server actions (D-007) | done |

## In progress
None.

## Next steps
1. When picomatch has a fixed release, revisit the report-only dev-tool audit step (D-004).

## Open questions
- `scripts/backup-now.sh`, `scripts/import-personal.cjs` and `scripts/azure-preflight.sh` have no npm script or caller (kept as manual tools; D-003 for the last).

## Tracked migrations
Deprecated patterns still in use (golden rule 1). New code never uses them; migrating is its own change.
- **Hand-rolled Undo blocks** (about 8 files) → `undoWith()` from `app/components/toast.tsx`, used in 4 files today.
- **uuid validation:** `z.string().uuid()` (about 20 places) → `uuid` from `src/lib/validations/common.ts`.
- **Action validation and errors:** four styles (throwing parse, `check()` in gym, `safeParse`, hand-written in `food.ts`) and four error contracts (thrown Error, `{success,error}`, `GymRefusal`, null) → one of each, to be chosen.
- **Form error state names:** `error`, `errorMsg`, `formError`, `titleError` → one name.
- **Device-local dates:** gym `getDay()` and food `toTimeString()` → `APP_TZ` helpers in `src/lib/format-date.ts`.
- **Import style:** `@/` (57 files) vs relative (41 files) → `@/`.
- **Test setup duplication:** `seedUser` in 11 test files and the `authState` mock in about 10 → one shared helper in `tests/`.
- **Pages calling `getServerSession` directly** although `RequireSession` guards the layouts (the pages test requires the check, so this stays until that test changes).
- **Layout of logic:** `src/app/actions` next to the root `app/`; add vs create function names; the "Health" label vs the `/food` route; `revalidatePath` only in gym.
- **CSS:** duplicate selectors `.entry-row`, `.todo-row`, `.item-link-text` in `app/globals.css`.
- **Chat role `"model"`:** a Gemini leftover in the food chat history.
- **`pg` version pinning:** root uses `^`, `worker/` exact.
