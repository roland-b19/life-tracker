# Life Tracker — knowledge base

A personal life-tracking app (wishlist, tasks, gym, food and health) built and used by one person: the owner. It started as a university Azure course project and now runs live for personal use on Vercel + Neon.

## Current state
Live and in daily use. The workflow setup (knowledge base, skills, checks, branch protection) is installed; code cleanup is done; every server action answers `{ success, error }` (D-010); browser specs (`npm run e2e`: Wishlist, weight card, Tasks, Gym, Health Today and Shopping, categories card, Settings) are in. The new color palette ([plan](plans/color-palette.md)) is merged, with the owner's per-page, general and Gym rounds (D-029 to D-032); only the iOS status bar check (steps 9–10) is open. The owner's whole-app aesthetics run is under way (round 1: D-033); the functional audit's fixes are planned and approved ([plan](plans/audit-fixes.md), D-034 to D-042); parts M (migration `0032`) and A to E (steps 2–21) are merged, M run on live, and the milestone audit's cleanup is done; the leftovers F1 to F3 are merged, and the owner's round on the rest is decided (D-047) and being built (the form hook's opening is in; its last forms and the action names are next); open: the owner's iPhone edge-swipe check and their final round (accepted edges: D-045, D-046). Details: [status](status.md).

## Pages
- [domain](domain.md) — what the product is, who uses it, the rules and the time zone it assumes
- [architecture](architecture.md) — parts, request flow, auth, data model, flags, push, deploy variants, tests
- decisions (D-NNN), with reasons and rejected alternatives, one page per area: [general](decisions/general.md)
- [conventions](conventions.md) — working agreement, the one way to do each job, checks, risk tiers, gotchas
- [status](status.md) — roadmap, tracked migrations, open questions
- [design system](../design/design-system.html) — every visual rule (tokens, components, states, spacing, opacity, motion) with light and dark examples; the latest look reference (`docs/design/OLD-*` files are history); `docs/design/design-rules-general.html` is the same rules made project-agnostic for new projects (a snapshot, not kept in sync)

## History
Session logs: `log/YYYY-MM.md` (newest: 2026-11). Superseded and removed content: `archive/`.
