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
| Tasks e2e spec (`/todos`, D-012) | planned, [plan](plans/e2e-tasks-spec.md) |
| Weight REST API → server actions (D-007) | done |
| Unused manual scripts: kept and documented (D-008) | done |

## In progress
- Tasks e2e spec: plan approved 2026-11-18, building ([plan](plans/e2e-tasks-spec.md)).

## Next steps
1. When picomatch has a fixed release, revisit the report-only dev-tool audit step (D-004).

## Open questions
None.

## Tracked migrations
Deprecated patterns still in use (golden rule 1). New code never uses them; migrating is its own change.
- **Layout of logic:** `src/app/actions` next to the root `app/`; add vs create function names; the "Health" label vs the `/food` route; `revalidatePath` only in gym.
