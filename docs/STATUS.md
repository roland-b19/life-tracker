# Status

_Last updated: 2026-11-16 by Claude (audit and slimming of the docs)._

Older history is in git (`git log`). Decisions: `docs/decisions.md`. What the app does: `README.md` and `docs/spec.md`.

## Where we are

- `main` holds everything through PR #122: the Tier 1 to 3 iterations, the Wishlist-style UI for every page, the Azure reminder pipeline (PRs #101 to #103), the Azure migration-job fix (#120), the Azure schema fix (#121, the schema comes only from the Drizzle migrations), the forms audits (#112 to #115), delete for meals and weigh-ins (#116), the Gym audit, the GymClient split and the `undoWith` sweep (#117 to #119), and the cleanup of unused files (#122).
- The personal deploy (variant B, Vercel + Neon) is live and holds the user's real data; its runbook is in `README.md`. Migrations 0030 and 0031 are applied on the live database (the user checked it, 2026-11-16). Nothing is deployed to Azure (see below).

## Current focus

Audit and slimming of the docs and code (branch `chore/audit-slim`, 2026-11-16): stale statements removed from the docs, executed plan sections collapsed, decisions marked as superseded (nothing deleted). The outcome and what was left alone on purpose is in `docs/decisions.md` ("Audit and slimming 2026-11-16").

Last checks in a browser (375px and desktop), Gym: day edit and Undo, start, log set, delete set and Undo, Exit and Resume, Finish, history open, deload edit and Undo. Meals add/delete/Undo, today's weigh-in delete/Undo and the Shopping tab also work. Not checked: Cancel workout and its Undo, a custom exercise created inside the day editor, a past day (read-only), older weigh-ins, a real phone, the Three.js model.

## Next

1. The Categories card is cramped at about 800px.
2. Azure A (`docs/release-plan.md` section 5): one final full deploy when the user decides, to show live what is still unseen: saved queries, a fired alert, the action-group e-mail, the budget, and the authorization and functionality walkthrough (`docs/azure-verification-plan.md`, Phase 2). Nothing deploys and no Azure resource is created without the user's explicit OK.

## Open questions

See "Open" in `docs/decisions.md`.

## Deployed Azure resources

**Nothing is deployed (2026-11-16).** The live run (`life-tracker-stage`, `italynorth`) was torn down the same day: `az group exists` is false, only the subscription's own `NetworkWatcherRG` remains (not owned by this project, never touched), and the subscription budget is gone. Evidence of the run: `docs/azure-evidence/2026-11-16-live-run.md`. Fixes found live, all on `main`: the schema comes from the Drizzle migrations (PR #121), `public/` ships in the image, reminders are delivered in the minute they are set. The teardown script returned exit 1 because `az group wait --deleted` returned early; it now polls `az group exists`. Soft-deleted Key Vaults from the earlier deploys and this run cost nothing and are purged by Azure on its own schedule (2027).

## Session log (newest first)

- 2026-11-16 — Audit and slimming (`chore/audit-slim`): docs aligned with the code; executed history collapsed; superseded decisions marked.
- 2026-11-16 — Azure live run (`life-tracker-stage`, italynorth): sign-in, queue reminders on a real device, Gym, export and the other pages verified; three defects found and fixed (schema from the Drizzle migrations, `public/` in the image, reminders delivered in the minute they are set); then torn down. Evidence: `docs/azure-evidence/2026-11-16-live-run.md`. Not yet shown live: saved queries, a fired alert, the action-group e-mail, the budget (do these on the final deploy).
- 2026-11-16 — Cleanup (`chore/cleanup-unused`, PR #122): removed old reports, the status archive, four one-off data scripts, two unused icons and unused exports.
