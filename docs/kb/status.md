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
| Unused manual scripts: kept and documented (D-008) | done |

## In progress
None.

## Next steps
1. When picomatch has a fixed release, revisit the report-only dev-tool audit step (D-004).

## Open questions
None.

## Tracked migrations
Deprecated patterns still in use (golden rule 1). New code never uses them; migrating is its own change.
- **Import style:** `@/` (57 files) vs relative (41 files) → `@/`.
- **Test setup duplication:** `tests/food-chat.test.ts` still has its own `seedUser` and `authState` mock (another change was editing that file); move it to `tests/auth.ts` (see conventions) next time it is touched, then remove this entry.
- **Layout of logic:** `src/app/actions` next to the root `app/`; add vs create function names; the "Health" label vs the `/food` route; `revalidatePath` only in gym.
- **Exact dependency versions:** the rule is caret ranges (see conventions). Still exact: `worker/` `@azure/identity`, `@azure/storage-queue`, `web-push`, and root `three` / `@types/three` (a 0.x library, so a caret does not allow a minor bump; decide before changing).
