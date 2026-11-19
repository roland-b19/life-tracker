# Life Tracker — knowledge base

A personal life-tracking app (wishlist, tasks, gym, food and health) built and used by one person: the owner. It started as a university Azure course project and now runs live for personal use on Vercel + Neon.

## Current state
Live and in daily use. The workflow setup (knowledge base, skills, checks, branch protection) is installed; code cleanup is done; every server action answers `{ success, error }` (D-010); browser specs (`npm run e2e`: Wishlist, weight card, Tasks, Gym, Health Today and Shopping, categories card, Settings) are in. The new color palette ([plan](plans/color-palette.md)) is merged, with the owner's per-page, general and Gym rounds (D-029 to D-032); only the iOS status bar check (steps 9–10) is open. The owner's whole-app aesthetics run is under way (round 1: D-033); a functionality run comes next. Details: [status](status.md).

## Pages
- [domain](domain.md) — what the product is, who uses it, the rules and the time zone it assumes
- [architecture](architecture.md) — parts, request flow, auth, data model, flags, push, deploy variants, tests
- decisions (D-NNN), with reasons and rejected alternatives, one page per area: [general](decisions/general.md)
- [conventions](conventions.md) — working agreement, the one way to do each job, checks, risk tiers, gotchas
- [status](status.md) — roadmap, tracked migrations, open questions
- [design system](../design/design-system.html) — every visual rule (tokens, components, states, spacing, opacity, motion) with light and dark examples; the latest look reference (`docs/design/OLD-*` files are history)

## History
Session logs: `log/YYYY-MM.md` (newest: 2026-11). Superseded and removed content: `archive/`.
