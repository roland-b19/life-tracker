---
summary: Where the project stands: roadmap, work in progress, next steps, open questions and tracked migrations.
last_verified: 2026-11-23
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
3. The functional audit's fixes (2026-11-20, D-034 to D-042): [plan](plans/audit-fixes.md), approved 2026-11-20; parts M, A to E and the leftovers F1 to F3 merged (#169 to #178), M run on live; the owner's round on the last leftovers (D-047) is built and verified on one integration branch, in its PR; open: the owner's iPhone edge-swipe check and their final round; accepted edges in D-045, D-046 and D-047.
4. Two e2e loose ends seen under load, not caused by a change: an ECONNRESET in the spec helper `signedInUserId` (`tests/e2e/helpers.ts`), and the Gym page's main thread stalled for about 14 s after a refresh.
5. `updateWishlistItem` parses its input twice (the action and `src/lib`); drop one parse.
6. Gym day editor: Cancel and Escape still work while a day save is out; after Cancel the day is saved anyway, and Escape shows a misleading "Changes discarded" (seen in the review of the D-047 round; it predates it).
7. Health meal form: reopened and saved again before the first save answers, it adds the same meal twice (predates D-047).
8. Cleanups listed by the D-047 round's simplify review, not done (over the round's cap): `ToastProvider` could await `saved` before an Undo, so the 7 Undo bodies that do it drop their first line; one `valuesOf(obj, keys)` helper for the hand-built old values (food goals, todos, wishlist Undo); the day editor's picker lists computed while closed.

## Later (noted by the owner, not started)
Each needs its own plan (golden rule 6) when the owner picks it up.
- Gym: a check, a rework and its charts.
- Toasts.
- Units of measure (Gym, Shopping).
- Animations.
- New features (each with its plan, in its own session).
- Data storage: the database, backups, limits and what stays on the device.

## Open questions
None open: the owner's round settled the audit leftovers (D-047), including the theme toast's `touches`, the two More forms and the recipe tables.

## Tracked migrations
Deprecated patterns still in use (golden rule 1). New code never uses them; migrating is its own change.
None left: the last one, `FormModal`'s `busy` prop, is gone (D-047).
