# Status

_Last updated: 2026-11-16 by Claude (GymClient split, undoWith helper)._

Older history is in git (`git log`). Decisions: `docs/decisions.md`.

## Where we are

- `main` holds everything through the four forms-audit PRs (#112 to #115). The Tier 1 to 3 iterations, the Wishlist-style UI for every page and the Azure reminder pipeline (PRs #101 to #103) are merged.
- The personal deploy (variant B, Vercel + Neon) is live and holds the user's real data; its runbook is in `README.md`. Nothing is deployed to Azure (see below).
- Browser check of PR #116 (375px and desktop): Meals add/delete/Undo, today's weigh-in delete/Undo and the Shopping tab work. Not checked: a past day (read-only), older weigh-ins.
- PR #116 (delete meals and weigh-ins, migration 0030) is merged. #104 (`fix/azure-migrate`) was closed on 2026-11-16 (Azure is on hold); its branch stays on the remote.

## Current focus

The Gym audit (#117), the GymClient split (#118) and the `undoWith` sweep (#119) are merged into `main`. Migrations 0030 and 0031 are applied on the live database.
- `app/gym/gym-client.tsx` (1346 lines) is now a 93-line composition. The pieces: `use-workout.ts` (the workout in hand), `active-workout.tsx`, `exercise-logger.tsx`, `training-days.tsx`, `day-editor.tsx`, `deload-card.tsx`, `history-card.tsx`, `types.ts`. No behaviour change.
- New helper `undoWith(showToast, write, failed)` in `app/components/toast.tsx`: an Undo that writes the old state back and warns when the write fails. Used by the day editor, the deload dialog and the custom exercise edit.
- Checked in a browser (375px and desktop): day edit and Undo, start, log set, delete set and Undo, Exit and Resume, Finish, history open, deload edit and Undo, modal focus returns to its button. Not checked: Cancel workout and its Undo, a custom exercise created inside the day editor, a real phone, the Three.js model.

## Application features (local)

- **Implemented locally:**
  - Pinned non-root container (`Dockerfile` with Node 24 LTS, `nextjs` user 1001).
  - Health endpoint (`/health`) and security headers.
  - OIDC authentication with production guard (`AUTH_DEV=false`).
  - Drizzle ORM schema, owner-scoped queries and restricted PostgreSQL roles.
  - Gym module: 5-day Upper/Lower split, set logging (`reps x load`), anomaly flags `!!`, PR tracking, 5-week deload tracker.
  - Food & Nutrition module: daily targets, meal logger, Past foods sheet, water tap counter (+250ml, +500ml), steps, shopping list filled by hand (categories editable and deletable), Today tab steps back through past days read-only.
  - Money module: removed from the UI on 2026-11-06; its tables were dropped by migration `0019` (3b).
  - To-Do & Habits module: automatic carry-over rollover, streak tracking, space segregation (`personal` vs `business`), Web Push notifications.
  - Food AI Connector (Claude MCP & Gemini): removed on 2026-11-08 (endpoints, tools, token code and tests); the `api_tokens` table was dropped by migration `0019` (3b). The in-app Assistant only logs meals.

## Next

1. Migrations 0030 and 0031 are applied on the live database (the user checked it, 2026-11-16).
2. `undoWith` sweep done (see decisions, 2026-11-16): it fits only the plain write-back Undos; the rest keep their own code on purpose.
3. The Categories card is cramped at about 800px.
4. Azure A (`docs/release-plan.md` section 5) after a week of watching variant B. Nothing deploys and no Azure resource is created without the user's explicit OK.

## Open questions

See "Open" in `docs/decisions.md`.

## Deployed Azure resources

**Nothing is deployed (2026-11-16).** The live run (`life-tracker-stage`, `italynorth`) was torn down the same day: `az group exists` is false, only the subscription's own `NetworkWatcherRG` remains, and the subscription budget is gone. Evidence of the run: `docs/azure-evidence/2026-11-16-live-run.md`. Fixes found live and already on the branch or in `main`: the schema comes from the Drizzle migrations (PR #121, open), `public/` ships in the image, reminders are delivered in the minute they are set. The teardown script returned exit 1 because `az group wait --deleted` returned early; it now polls `az group exists`. One more soft-deleted Key Vault from this run costs nothing and is purged by Azure on its own schedule (all 2027).

Earlier (2026-11-08): all resources deployed for Iteration 2 testing were
synchronously deleted via `scripts/azure-teardown.sh stage DELETE`. The subscription's
pre-existing `NetworkWatcherRG` is not owned by this project and was intentionally left untouched.

Checked on 2026-11-08: the only resource group in the subscription is `NetworkWatcherRG` (Network Watchers in belgiumcentral, polandcentral and italynorth, no flow logs, no cost). The empty `lt-identity` group from the External ID attempt was deleted the same day. Six soft-deleted Key Vaults from earlier deploys cost nothing and are purged by Azure on 2027-02-01.

## Session log (newest first)

- 2026-11-16 — Azure live run (`life-tracker-stage`, italynorth): sign-in, queue reminders on a real device, Gym, export and the other pages verified; three defects found and fixed (schema from the Drizzle migrations, `public/` in the image, reminders delivered in the minute they are set); then torn down. Evidence: `docs/azure-evidence/2026-11-16-live-run.md`. Not yet shown live: saved queries, a fired alert, the action-group e-mail, the budget (do these on the final deploy).
- 2026-11-16 — Cleanup (`chore/cleanup-unused`): removed old reports, the status archive, four one-off data scripts, two unused icons and unused exports. Earlier history is in `git log`.
