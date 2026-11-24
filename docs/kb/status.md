---
summary: Where the project stands: roadmap, work in progress, next steps, open questions and tracked migrations.
last_verified: 2026-11-24
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
The owner stopped the round here (2026-11-24): P and Q are merged into `chore/audit-edges`; what follows waits for their word.
1. Close the color palette and audit-fixes plans: every owner check is done (2026-11-24: the edge swipe works, the status bar reads well in both modes so `black-translucent` stays, the aesthetics and functionality runs are fine; small fixes come ad hoc). The palette's remaining done criteria are checked by this round's final verify.
2. Cleanups listed by the D-047 round's simplify review, not done (over the round's cap): `ToastProvider` could await `saved` before an Undo, so the 7 Undo bodies that do it drop their first line; one `valuesOf(obj, keys)` helper for the hand-built old values (food goals, todos, wishlist Undo); the day editor's picker lists computed while closed.
3. Gym day editor: while a save is out, the drag handles still reorder rows with a mouse (Chromium sends pointer events to the disabled button; `useDragSort` in `app/components/lists.tsx`, `DragHandle`); the reorder is dropped silently when the save answers. Predates D-047; iOS touch not checked.
4. Then the final verify of `chore/audit-edges` and its PR to `main`.

Known, not a bug: under heavy e2e load the Gym page's main thread can stall while headless Chromium's software GL (SwiftShader) reads back the muscle map's WebGL draws. It now draws 2 times on load, not 5 (longest task about 2850 → 1140 ms with 4 workers); real devices composite on the GPU and do no readback.

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
