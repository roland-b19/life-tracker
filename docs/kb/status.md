---
summary: Where the project stands: roadmap, work in progress, next steps, open questions and tracked migrations.
last_verified: 2026-11-27
---

# Status

## Roadmap
| Stage or feature | State |
|---|---|
| Wishlist, Tasks, Gym, Food and health, Settings | done, live on Vercel + Neon |
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
| New color palette: slate, one turquoise accent, dark and light modes with a manual switch (D-020 to D-032) | done 2026-11-27, [plan](archive/plans/color-palette.md) |
| Functional audit fixes, open copies kept in sync, the midnight rollover, no swipe navigation (D-034 to D-047) | done, [plan](archive/plans/audit-fixes.md) (parts M and A to F and the owner's round in `main`; the last edges on `chore/audit-edges`, going to `main` with its PR) |

## In progress
- `chore/audit-edges`: the functional audit's last edges, the D-047 round's simplify cleanups and the Gym day editor's drag-while-saving edge. Review round 1's two Important bugs are fixed and verified (the deload card saves the weeks the server stored; a drag under way ends as its handle is disabled, with no pointer event); round 2 found no Important bug, and its two test Nits are being fixed.

## Next steps
1. Finish the review of `chore/audit-edges` and open its PR to `main`; the owner said to merge it once it is green (2026-11-27).

Known, not a bug: under heavy e2e load the Gym page's main thread can stall while headless Chromium's software GL (SwiftShader) reads back the muscle map's WebGL draws. It now draws 2 times on load, not 5 (longest task about 2850 → 1140 ms with 4 workers); real devices composite on the GPU and do no readback.

Known, not fixed (listed by review, outside the change's scope): a second finger pressing another handle in the same list mid-drag ends the first drag, but the first finger's moves then drive the second row (`useDragSort` keeps no `pointerId`); a muscle map hidden at 0x0 and shown at the same size skips its redraw, which might leave the canvas blank where a browser drops the drawing buffer (not reproducible in Chromium).

## Later (noted by the owner, not started)
Each needs its own plan (golden rule 6) when the owner picks it up.
- Gym: a check, a rework and its charts.
- Toasts.
- Units of measure (Gym, Shopping).
- Animations.
- New features (each with its plan, in its own session).
- Data storage: the database, backups, limits and what stays on the device.
- Rotate the Neon database password (the owner deferred it, 2026-11-24).

## Open questions
None open: the owner's round settled the audit leftovers (D-047), including the theme toast's `touches`, the two More forms and the recipe tables.

## Tracked migrations
Deprecated patterns still in use (golden rule 1). New code never uses them; migrating is its own change.
None left: the last one, `FormModal`'s `busy` prop, is gone (D-047).
