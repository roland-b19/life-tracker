---
summary: Where the project stands: roadmap, work in progress, next steps, open questions and tracked migrations.
last_verified: 2026-11-28
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
| First e2e spec (Wishlist, Playwright, D-005) | done |
| One source for the local test credentials; dead Azure host fallbacks removed (D-006) | done |
| Tasks e2e spec (`/todos`, D-012) | done |
| Gym e2e spec (`/gym`, D-014) | done |
| Health e2e spec (`/health` Today and Shopping, D-015) | done |
| Categories e2e spec (Wishlist, Tasks Daily, Health shopping, D-016) | done |
| Settings e2e spec (`/settings`, D-017) | done |
| Weight REST API → server actions (D-007) | done |
| Test database per worktree, created and migrated by a global setup; `AGENTS.md` ignored (D-018) | done |
| Axe scans wait for the refresh a write left due (second `document-title` flake, D-019) | done |
| Unused manual scripts: kept and documented (D-008) | done |
| New color palette: slate, one turquoise accent, dark and light modes with a manual switch (D-020 to D-032) | done 2026-11-27 |
| Functional audit fixes, open copies kept in sync, the midnight rollover, no swipe navigation (D-034 to D-047) | done 2026-11-27 (parts M and A to F, the owner's round and the last edges, PR #181, all in `main`) |
| Workflow update: one check command and `/code-review medium` before each PR, no hooks, session log or KB archive (D-049) | done 2026-11-28 |

## In progress
Nothing: only the Later list is left (the last open questions were closed on 2026-11-28).

## Next steps
1. The owner picks the next item from Later; a new feature starts with a plan (golden rule 6).

Known, not a bug: under heavy e2e load the Gym page's main thread can stall while headless Chromium's software GL (SwiftShader) reads back the muscle map's WebGL draws. It now draws 2 times on load, not 5 (longest task about 2850 → 1140 ms with 4 workers); real devices composite on the GPU and do no readback.

Known, waiting on upstream: `npm audit` and Dependabot report a moderate `esbuild` advisory (GHSA-67mh-4wv8-2f99) in a dev-only package that comes through `drizzle-kit` and is never in the published app. The only fix npm offers is a breaking downgrade of `drizzle-kit`, so the owner chose to wait (2026-11-28).

## Later (noted by the owner, not started)
A new feature among them starts with a plan (golden rule 6) when the owner picks it up.
- Gym: a check, a rework and its charts.
- Toasts.
- Units of measure (Gym, Shopping).
- Animations.
- New features.
- Data storage: the database, backups, limits and what stays on the device.
- Azure: one iteration that checks the app and the course requirements there, on the owner's word only. It needs their OK for the Azure resources (they cost money) and those requirements, which are not in the repo.

## Open questions
None.

## Tracked migrations
Deprecated patterns still in use (golden rule 1). New code never uses them; migrating is its own change.
None left: the last one, `FormModal`'s `busy` prop, is gone (D-047).
