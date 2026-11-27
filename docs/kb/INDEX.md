# Life Tracker — knowledge base

A personal life-tracking app (wishlist, tasks, gym, food and health) built and used by one person: the owner. It started as a university Azure course project and now runs live for personal use on Vercel + Neon.

## Current state
Live and in daily use. The workflow setup (knowledge base, skills, checks, branch protection) is installed; code cleanup is done; every server action answers `{ success, error }` (D-010); browser specs (`npm run e2e`: Wishlist, weight card, Tasks, Gym, Health Today and Shopping, categories card, Settings) are in. The new color palette ([plan](archive/plans/color-palette.md), D-020 to D-032) is done. The owner's whole-app aesthetics run is under way (round 1: D-033). The functional audit's fixes ([plan](archive/plans/audit-fixes.md), D-034 to D-047) are done and in `main`; the last edges, the simplify cleanups and the Gym drag-while-saving edge are on `chore/audit-edges`, which goes to `main` once its final verify, review and CI pass (the owner's word, 2026-11-27). Details: [status](status.md).

## Pages
- [domain](domain.md) — what the product is, who uses it, the rules and the time zone it assumes
- [architecture](architecture.md) — parts, request flow, auth, data model, flags, push, deploy variants, tests
- decisions (D-NNN), with reasons and rejected alternatives, one page per area: [general](decisions/general.md)
- [conventions](conventions.md) — working agreement, the one way to do each job, checks, risk tiers, gotchas
- [status](status.md) — roadmap, tracked migrations, open questions
- [design system](../design/design-system.html) — every visual rule (tokens, components, states, spacing, opacity, motion) with light and dark examples; the latest look reference (`docs/design/OLD-*` files are history); `docs/design/design-rules-general.html` is the same rules made project-agnostic for new projects (a snapshot, not kept in sync)

## History
Session logs: `log/YYYY-MM.md` (newest: 2026-11). Superseded and removed content: `archive/`.
