---
summary: Where the project stands: roadmap, work in progress, next steps, open questions and tracked migrations.
last_verified: 2026-11-19
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
| First e2e spec (Wishlist, Playwright, D-005) | done, [plan](archive/plans/e2e-first-spec.md) |
| One source for the local test credentials; dead Azure host fallbacks removed (D-006) | done |
| Tasks e2e spec (`/todos`, D-012) | done, [plan](archive/plans/e2e-tasks-spec.md) |
| Gym e2e spec (`/gym`, D-014) | done, [plan](archive/plans/e2e-gym-spec.md) |
| Health e2e spec (`/health` Today and Shopping, D-015) | done, [plan](archive/plans/e2e-health-spec.md) |
| Categories e2e spec (Wishlist, Tasks Daily, Health shopping, D-016) | done, [plan](archive/plans/e2e-categories-spec.md) |
| Settings e2e spec (`/settings`, D-017) | done, [plan](archive/plans/e2e-settings-spec.md) |
| Weight REST API → server actions (D-007) | done |
| Test database per worktree, created and migrated by a global setup; `AGENTS.md` ignored (D-018) | done |
| Axe scans wait for the refresh a write left due (second `document-title` flake, D-019) | done |
| Unused manual scripts: kept and documented (D-008) | done |
| New color palette: slate, one turquoise accent, dark and light modes with a manual switch (D-020 to D-024) | in progress, [plan](plans/color-palette.md) (approved 2026-11-19; built on `claude/palette-build-2d56b0` through step 8, waiting on the owner's iOS check, step 9) |

## In progress
- Color palette: steps 2–8, 11 and 12 built (tokens, light scans, surfaces, neutral small buttons, numerals, the Appearance switch, icons, docs); step 9 waits on the owner's iOS status bar check, then step 10.

## Next steps
1. When picomatch has a fixed release, revisit the report-only dev-tool audit step (D-004).

## Open questions
None.

## Tracked migrations
Deprecated patterns still in use (golden rule 1). New code never uses them; migrating is its own change.
None.
