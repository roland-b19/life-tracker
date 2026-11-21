---
summary: Where the project stands: roadmap, work in progress, next steps, open questions and tracked migrations.
last_verified: 2026-11-20
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
| New color palette: slate, one turquoise accent, dark and light modes with a manual switch (D-020 to D-032) | in progress, [plan](plans/color-palette.md) (approved 2026-11-19; steps 1–8, 11 and 12 merged into `main` on the owner's word, 2026-11-19; steps 9 and 10, the owner's iOS status bar check, still open) |

## In progress
- Color palette: steps 2–8, 11 and 12 built (tokens, light scans, surfaces, neutral small buttons, numerals, the Appearance switch, icons, docs), plus the owner's changes after trying it (D-025, D-026 and D-028: no navigation dot, the tab bar in the segmented colors swapped with the thumb's shadow, a fixed glow, a fade between modes, opaque secondary buttons, the app opening on Tasks), the data export, which froze the iPhone app, removed (D-027, D-028), and the owner's per-page round (D-029: one turquoise glow, card edges on buttons and page-level tabs, category boxes, Wishlist, Tasks and Health fixes) and the owner's general round (D-030: one raised look for every button, card and tab, one set of in-card gaps on every page, the Tasks ring centered on the card, no Health section icons) and the owner's Gym round (D-031: only actionable controls raised, Gym layout fixes, the workout timer counting while the app is closed) and its follow-ups (D-032: the sign-in glow on iOS 26, Log set at rest, the muscle map's day lines, one detail style); merged into `main` at the owner's word before steps 9 and 10, which wait on the owner's iOS status bar check (`statusBarStyle` stays `black-translucent` until then).

## Next steps
1. The owner's final aesthetics run over the whole app (round 1: D-033), then a full functionality run, page by page: the owner lists what to fix or check on each page.
2. Color palette steps 9 and 10: the owner's iOS status bar check, then keep `black-translucent` or switch to `default`.
3. The functional audit's fixes (2026-11-20, D-034 to D-042): [plan](plans/audit-fixes.md), approved 2026-11-20; part M (migration `0032`) merged and run on live; part A built and verified, its PR next; parts B and C building; the owner's choices are in their private report.

## Later (noted by the owner, not started)
Each needs its own plan (golden rule 6) when the owner picks it up.
- Gym: a check, a rework and its charts.
- Toasts.
- Units of measure (Gym, Shopping).
- Animations.

## Open questions
- Long lists have two More forms (inline `useMore` on Gym history, the dialog `useMoreDialog` on Health meals, D-029): which one wins? Asked the owner 2026-11-19.
- The `recipes` and `recipe_ingredients` tables (and their seeded rows) have no reader or writer left, and nothing sets `meals.forgotten` (read only, it keeps old hidden meals hidden) (audit fixes, steps 15 and 16): drop them? Dropping is a non-additive migration, so it waits for the owner.

## Tracked migrations
Deprecated patterns still in use (golden rule 1). New code never uses them; migrating is its own change.
- `requireUser()` before `respond` (conventions, writes from the UI): `src/actions/claude-connection.ts`, `gym.ts`, `todos.ts`, `wishlist.ts`. Each part of the [audit fixes](plans/audit-fixes.md) moves its own files; step 21 greps that none is left.
- A page or layout without its path (`requirePageUser()`, `RequireSession` without `path`): the four left (`/gym`, `/settings`, `/todos`, `/wishlist`). Parts B–E pass them.
- `src/lib/decimal-input.ts` (D-037): `app/gym/exercise-logger.tsx`, `app/gym/types.ts`, `tests/format-date.test.ts`. Step 21 deletes it.
